/// Batch operations for high-volume token processing.
///
/// Provides `batch_reveal` (batch token creation) and `batch_settle` (batch mint)
/// with atomic execution, storage-access optimization, and a hard batch-size cap
/// to bound gas consumption.
use soroban_sdk::{Address, Env, Vec};

use crate::storage;
use crate::types::{Error, TokenCreationParams};

/// Maximum number of items allowed in a single batch call.
pub const MAX_BATCH_SIZE: u32 = 50;

/// Batch-create tokens in a single atomic transaction.
///
/// All parameter validation is performed before any state is written, so a
/// validation failure on any item leaves the ledger unchanged.
///
/// # Gas optimisation
/// Token count is read once, incremented in memory, and written once at the
/// end — avoiding N redundant storage round-trips.
///
/// # Arguments
/// * `creator`            – Address that will own all created tokens (must auth).
/// * `tokens`             – Parameters for each token; max `MAX_BATCH_SIZE` items.
/// * `total_fee_payment`  – Combined fee covering every token in the batch.
///
/// # Returns
/// Indices of the newly created tokens (in input order).
///
/// # Errors
/// * `ContractPaused`      – Factory is paused.
/// * `BatchTooLarge`       – `tokens.len() > MAX_BATCH_SIZE`.
/// * `InvalidParameters`   – Empty batch.
/// * `InsufficientFee`     – `total_fee_payment` is below the required total.
/// * `InvalidTokenParams`  – Any token fails parameter validation.
pub fn batch_reveal(
    env: &Env,
    creator: Address,
    tokens: Vec<TokenCreationParams>,
    total_fee_payment: i128,
) -> Result<Vec<u32>, Error> {
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    creator.require_auth();

    let batch_len = tokens.len();
    if batch_len == 0 {
        return Err(Error::InvalidParameters);
    }
    if batch_len > MAX_BATCH_SIZE {
        return Err(Error::BatchTooLarge);
    }

    // ── Phase 1: validate all params and accumulate required fee ──────────
    let base_fee = storage::get_base_fee(env);
    let metadata_fee = storage::get_metadata_fee(env);

    let mut required_fee: i128 = 0;
    for token in tokens.iter() {
        validate_token_params(env, &token)?;
        let token_fee = if token.metadata_uri.is_some() {
            base_fee
                .checked_add(metadata_fee)
                .ok_or(Error::ArithmeticError)?
        } else {
            base_fee
        };
        required_fee = required_fee
            .checked_add(token_fee)
            .ok_or(Error::ArithmeticError)?;
    }

    if total_fee_payment < required_fee {
        return Err(Error::InsufficientFee);
    }

    // ── Phase 2: write state (all validations passed) ─────────────────────
    // Read token count once to avoid N storage reads.
    let start_index = storage::get_token_count(env);
    let mut indices = Vec::new(env);

    for (i, token) in tokens.iter().enumerate() {
        let token_index = start_index
            .checked_add(i as u32)
            .ok_or(Error::ArithmeticError)?;

        crate::token_creation::create_token_internal(env, &creator, &token, token_index)?;
        indices.push_back(token_index);
    }

    // Write the new token count in a single storage operation.
    let new_count = start_index
        .checked_add(batch_len)
        .ok_or(Error::ArithmeticError)?;
    env.storage()
        .instance()
        .set(&crate::types::DataKey::TokenCount, &new_count);

    crate::events::emit_batch_tokens_created(env, &creator, batch_len);

    Ok(indices)
}

/// Batch-mint tokens to multiple recipients in a single atomic transaction.
///
/// All recipients receive tokens from the same `token_index`. The caller must
/// be the token creator. Validation of every (recipient, amount) pair is done
/// before any balance is updated.
///
/// # Gas optimisation
/// Token info is loaded once and reused across all mint operations.
///
/// # Arguments
/// * `creator`      – Token creator address (must auth).
/// * `token_index`  – Index of the token to mint.
/// * `recipients`   – `(recipient_address, amount)` pairs; max `MAX_BATCH_SIZE`.
///
/// # Returns
/// Total amount minted across all recipients.
///
/// # Errors
/// * `ContractPaused`    – Factory is paused.
/// * `TokenNotFound`     – `token_index` does not exist.
/// * `Unauthorized`      – Caller is not the token creator.
/// * `TokenPaused`       – Token is paused.
/// * `BatchTooLarge`     – More than `MAX_BATCH_SIZE` recipients.
/// * `InvalidParameters` – Empty recipients list or any amount ≤ 0.
/// * `MaxSupplyExceeded` – Batch would exceed the token's max supply.
pub fn batch_settle(
    env: &Env,
    creator: Address,
    token_index: u32,
    recipients: Vec<(Address, i128)>,
) -> Result<i128, Error> {
    if storage::is_paused(env) {
        return Err(Error::ContractPaused);
    }

    creator.require_auth();

    let batch_len = recipients.len();
    if batch_len == 0 {
        return Err(Error::InvalidParameters);
    }
    if batch_len > MAX_BATCH_SIZE {
        return Err(Error::BatchTooLarge);
    }

    // Load token info once.
    let token_info = storage::get_token_info(env, token_index).ok_or(Error::TokenNotFound)?;

    if token_info.creator != creator {
        return Err(Error::Unauthorized);
    }
    if storage::is_token_paused(env, token_index) {
        return Err(Error::TokenPaused);
    }

    // ── Phase 1: validate all amounts and compute total ───────────────────
    let mut total_mint: i128 = 0;
    for (_, amount) in recipients.iter() {
        if amount <= 0 {
            return Err(Error::InvalidParameters);
        }
        total_mint = total_mint
            .checked_add(amount)
            .ok_or(Error::ArithmeticError)?;
    }

    // Check max supply once using the aggregated total.
    if let Some(max) = token_info.max_supply {
        let new_supply = token_info
            .total_supply
            .checked_add(total_mint)
            .ok_or(Error::ArithmeticError)?;
        if new_supply > max {
            return Err(Error::MaxSupplyExceeded);
        }
    }

    // ── Phase 2: apply mints ──────────────────────────────────────────────
    for (recipient, amount) in recipients.iter() {
        crate::mint::mint(env, token_index, &recipient, amount)?;
    }

    crate::events::emit_batch_settle(env, token_index, &creator, batch_len, total_mint);

    Ok(total_mint)
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn validate_token_params(env: &Env, params: &TokenCreationParams) -> Result<(), Error> {
    if params.name.len() == 0 || params.name.len() > 32 {
        return Err(Error::InvalidTokenParams);
    }
    if params.symbol.len() == 0 || params.symbol.len() > 12 {
        return Err(Error::InvalidTokenParams);
    }
    if params.decimals > 18 {
        return Err(Error::InvalidTokenParams);
    }
    if params.initial_supply <= 0 {
        return Err(Error::InvalidTokenParams);
    }
    crate::mint::validate_max_supply_at_creation(params.initial_supply, params.max_supply)?;
    let _ = env; // env available for future validation
    Ok(())
}

// ── tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env, String};

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, crate::TokenFactory);
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &1_000_000_i128, &500_000_i128);

        (env, contract_id, admin, treasury)
    }

    fn make_params(env: &Env, name: &str, symbol: &str) -> TokenCreationParams {
        TokenCreationParams {
            name: String::from_str(env, name),
            symbol: String::from_str(env, symbol),
            decimals: 7,
            initial_supply: 1_000_000,
            max_supply: None,
            metadata_uri: None,
        }
    }

    // ── batch_reveal ──────────────────────────────────────────────────────

    #[test]
    fn batch_reveal_creates_tokens_atomically() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let tokens = vec![
            &env,
            make_params(&env, "Alpha", "ALP"),
            make_params(&env, "Beta", "BET"),
            make_params(&env, "Gamma", "GAM"),
        ];
        // 3 tokens × base_fee (1_000_000 each, no metadata)
        let indices = client.batch_reveal(&admin, &tokens, &3_000_000_i128).unwrap();

        assert_eq!(indices.len(), 3);
        assert_eq!(indices.get(0).unwrap(), 0);
        assert_eq!(indices.get(1).unwrap(), 1);
        assert_eq!(indices.get(2).unwrap(), 2);
    }

    #[test]
    fn batch_reveal_rejects_empty_batch() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let tokens: Vec<TokenCreationParams> = vec![&env];
        let err = client.batch_reveal(&admin, &tokens, &0_i128).unwrap_err();
        assert_eq!(err, crate::types::Error::InvalidParameters.into());
    }

    #[test]
    fn batch_reveal_rejects_insufficient_fee() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let tokens = vec![&env, make_params(&env, "Alpha", "ALP")];
        let err = client.batch_reveal(&admin, &tokens, &0_i128).unwrap_err();
        assert_eq!(err, crate::types::Error::InsufficientFee.into());
    }

    #[test]
    fn batch_reveal_atomic_rollback_on_invalid_param() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let bad = TokenCreationParams {
            name: String::from_str(&env, ""),
            symbol: String::from_str(&env, "BAD"),
            decimals: 7,
            initial_supply: 1_000_000,
            max_supply: None,
            metadata_uri: None,
        };
        let tokens = vec![&env, make_params(&env, "Good", "GD"), bad];
        let err = client.batch_reveal(&admin, &tokens, &2_000_000_i128).unwrap_err();
        assert_eq!(err, crate::types::Error::InvalidTokenParams.into());

        // Token count must remain 0 — no partial writes.
        let state = client.get_state();
        let _ = state; // state is accessible; token count checked via get_token_info
        let info = client.get_token_info(&0_u32);
        assert!(info.is_err(), "no token should have been created");
    }

    // ── batch_settle ──────────────────────────────────────────────────────

    #[test]
    fn batch_settle_mints_to_multiple_recipients() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        // Create a token first.
        client
            .create_token(
                &admin,
                &String::from_str(&env, "MyToken"),
                &String::from_str(&env, "MTK"),
                &7_u32,
                &1_000_000_i128,
                &None,
                &1_000_000_i128,
            )
            .unwrap();

        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);
        let r3 = Address::generate(&env);

        let recipients = vec![
            &env,
            (r1.clone(), 100_i128),
            (r2.clone(), 200_i128),
            (r3.clone(), 300_i128),
        ];

        let total = client.batch_settle(&admin, &0_u32, &recipients).unwrap();
        assert_eq!(total, 600_i128);
    }

    #[test]
    fn batch_settle_rejects_zero_amount() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        client
            .create_token(
                &admin,
                &String::from_str(&env, "MyToken"),
                &String::from_str(&env, "MTK"),
                &7_u32,
                &1_000_000_i128,
                &None,
                &1_000_000_i128,
            )
            .unwrap();

        let r1 = Address::generate(&env);
        let recipients = vec![&env, (r1, 0_i128)];
        let err = client.batch_settle(&admin, &0_u32, &recipients).unwrap_err();
        assert_eq!(err, crate::types::Error::InvalidParameters.into());
    }

    #[test]
    fn batch_settle_rejects_non_creator() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        client
            .create_token(
                &admin,
                &String::from_str(&env, "MyToken"),
                &String::from_str(&env, "MTK"),
                &7_u32,
                &1_000_000_i128,
                &None,
                &1_000_000_i128,
            )
            .unwrap();

        let impostor = Address::generate(&env);
        let r1 = Address::generate(&env);
        let recipients = vec![&env, (r1, 100_i128)];
        let err = client.batch_settle(&impostor, &0_u32, &recipients).unwrap_err();
        assert_eq!(err, crate::types::Error::Unauthorized.into());
    }

    #[test]
    fn batch_settle_respects_max_supply() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        // Create token with max_supply = 1_000_000 (already at cap from initial supply).
        let params = vec![
            &env,
            TokenCreationParams {
                name: String::from_str(&env, "Capped"),
                symbol: String::from_str(&env, "CAP"),
                decimals: 7,
                initial_supply: 1_000_000,
                max_supply: Some(1_000_000),
                metadata_uri: None,
            },
        ];
        client.batch_reveal(&admin, &params, &1_000_000_i128).unwrap();

        let r1 = Address::generate(&env);
        let recipients = vec![&env, (r1, 1_i128)];
        let err = client.batch_settle(&admin, &0_u32, &recipients).unwrap_err();
        assert_eq!(err, crate::types::Error::MaxSupplyExceeded.into());
    }

    #[test]
    fn batch_reveal_with_10_tokens_succeeds() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let mut tokens = Vec::new(&env);
        for i in 0u32..10 {
            let name = soroban_sdk::String::from_str(&env, "Token");
            let sym_str = if i < 10 {
                soroban_sdk::String::from_str(&env, "TK0")
            } else {
                soroban_sdk::String::from_str(&env, "TKX")
            };
            tokens.push_back(TokenCreationParams {
                name,
                symbol: sym_str,
                decimals: 7,
                initial_supply: 1_000_000,
                max_supply: None,
                metadata_uri: None,
            });
        }

        let indices = client.batch_reveal(&admin, &tokens, &10_000_000_i128).unwrap();
        assert_eq!(indices.len(), 10);
    }
}

//! IPFS Metadata Pinning with Redundancy
//!
//! Manages a set of IPFS pin records for token metadata URIs.
//! Each token can have up to `MAX_PINS` pin entries pointing to the same
//! content via different gateways / pinning services, providing redundancy.
//!
//! # Design
//! - Pin records are stored per-token and are append-only (pins can be
//!   deactivated but not deleted, preserving the audit trail).
//! - Only the token creator or the factory admin may add/deactivate pins.
//! - The primary metadata URI on `TokenInfo` is set once and is immutable;
//!   pin records are supplementary redundancy pointers.
//! - Events are emitted for every pin addition and deactivation.
//!
//! # Security (OWASP)
//! - Authorization: `require_auth` + creator/admin check on every mutation.
//! - Input validation: URI length bounded by `MAX_URI_LEN`.
//! - Arithmetic: checked operations throughout.
//! - No unbounded loops: pin count capped at `MAX_PINS`.

use crate::{storage, types::Error};
use soroban_sdk::{contracttype, symbol_short, Address, Env, String};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum number of pin records per token.
pub const MAX_PINS: u32 = 10;

/// Maximum byte length of an IPFS URI string.
pub const MAX_URI_LEN: u32 = 256;

// ── Types ─────────────────────────────────────────────────────────────────────

/// A single IPFS pin record for a token's metadata.
///
/// # Fields
/// * `pin_index`   – Position in the token's pin list (0-based).
/// * `token_index` – The token this pin belongs to.
/// * `uri`         – IPFS URI (e.g. `ipfs://Qm…` or a gateway URL).
/// * `pinned_by`   – Address that added this pin.
/// * `pinned_at`   – Ledger timestamp when the pin was added.
/// * `active`      – Whether this pin is currently active.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IpfsPin {
    pub pin_index: u32,
    pub token_index: u32,
    pub uri: String,
    pub pinned_by: Address,
    pub pinned_at: u64,
    pub active: bool,
}

/// Storage key for IPFS pin data.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PinKey {
    /// Individual pin record: (token_index, pin_index).
    Pin(u32, u32),
    /// Number of pins registered for a token.
    PinCount(u32),
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Add an IPFS pin record for a token's metadata.
///
/// The caller must be either the token creator or the factory admin.
/// Each token may have at most `MAX_PINS` active pin records.
///
/// # Arguments
/// * `env`         – The contract environment.
/// * `caller`      – Address adding the pin (must authorize).
/// * `token_index` – Index of the token to pin.
/// * `uri`         – IPFS URI for the metadata (max `MAX_URI_LEN` bytes).
///
/// # Returns
/// The index of the newly created pin record.
///
/// # Errors
/// * `Error::TokenNotFound`     – Token index does not exist.
/// * `Error::Unauthorized`      – Caller is not the token creator or admin.
/// * `Error::InvalidParameters` – URI is empty, too long, or pin limit reached.
/// * `Error::ArithmeticError`   – Pin count overflowed.
pub fn add_pin(
    env: &Env,
    caller: &Address,
    token_index: u32,
    uri: String,
) -> Result<u32, Error> {
    // ── Authorization ────────────────────────────────────────────────────────
    caller.require_auth();

    let token_info = storage::get_token_info(env, token_index).ok_or(Error::TokenNotFound)?;
    let admin = storage::get_admin(env);

    if *caller != token_info.creator && *caller != admin {
        return Err(Error::Unauthorized);
    }

    // ── Input validation ─────────────────────────────────────────────────────
    if uri.len() == 0 || uri.len() > MAX_URI_LEN {
        return Err(Error::InvalidParameters);
    }

    // ── Pin count check ──────────────────────────────────────────────────────
    let pin_count = get_pin_count(env, token_index);
    if pin_count >= MAX_PINS {
        return Err(Error::InvalidParameters);
    }

    let pin_index = pin_count;

    let pin = IpfsPin {
        pin_index,
        token_index,
        uri: uri.clone(),
        pinned_by: caller.clone(),
        pinned_at: env.ledger().timestamp(),
        active: true,
    };

    // ── Persist ──────────────────────────────────────────────────────────────
    env.storage()
        .persistent()
        .set(&PinKey::Pin(token_index, pin_index), &pin);

    let new_count = pin_count.checked_add(1).ok_or(Error::ArithmeticError)?;
    env.storage()
        .persistent()
        .set(&PinKey::PinCount(token_index), &new_count);

    // ── Event ────────────────────────────────────────────────────────────────
    emit_pin_added(env, token_index, pin_index, caller, &uri);

    Ok(pin_index)
}

/// Deactivate an IPFS pin record (soft-delete, preserves audit trail).
///
/// The caller must be either the token creator or the factory admin.
///
/// # Arguments
/// * `env`         – The contract environment.
/// * `caller`      – Address deactivating the pin (must authorize).
/// * `token_index` – Index of the token.
/// * `pin_index`   – Index of the pin to deactivate.
///
/// # Errors
/// * `Error::TokenNotFound`     – Token or pin does not exist.
/// * `Error::Unauthorized`      – Caller is not the token creator or admin.
/// * `Error::InvalidParameters` – Pin is already inactive.
pub fn deactivate_pin(
    env: &Env,
    caller: &Address,
    token_index: u32,
    pin_index: u32,
) -> Result<(), Error> {
    caller.require_auth();

    let token_info = storage::get_token_info(env, token_index).ok_or(Error::TokenNotFound)?;
    let admin = storage::get_admin(env);

    if *caller != token_info.creator && *caller != admin {
        return Err(Error::Unauthorized);
    }

    let mut pin: IpfsPin = env
        .storage()
        .persistent()
        .get(&PinKey::Pin(token_index, pin_index))
        .ok_or(Error::TokenNotFound)?;

    if !pin.active {
        return Err(Error::InvalidParameters);
    }

    pin.active = false;
    env.storage()
        .persistent()
        .set(&PinKey::Pin(token_index, pin_index), &pin);

    emit_pin_deactivated(env, token_index, pin_index, caller);

    Ok(())
}

/// Retrieve a specific pin record.
///
/// # Arguments
/// * `env`         – The contract environment.
/// * `token_index` – Index of the token.
/// * `pin_index`   – Index of the pin.
///
/// # Returns
/// `Some(IpfsPin)` if found, `None` otherwise.
pub fn get_pin(env: &Env, token_index: u32, pin_index: u32) -> Option<IpfsPin> {
    env.storage()
        .persistent()
        .get(&PinKey::Pin(token_index, pin_index))
}

/// Return the total number of pin records for a token (active + inactive).
pub fn get_pin_count(env: &Env, token_index: u32) -> u32 {
    env.storage()
        .persistent()
        .get(&PinKey::PinCount(token_index))
        .unwrap_or(0)
}

/// Return the number of *active* pin records for a token.
pub fn get_active_pin_count(env: &Env, token_index: u32) -> u32 {
    let total = get_pin_count(env, token_index);
    let mut active = 0u32;
    for i in 0..total {
        if let Some(pin) = get_pin(env, token_index, i) {
            if pin.active {
                active = active.saturating_add(1);
            }
        }
    }
    active
}

// ── Internal helpers ──────────────────────────────────────────────────────────

fn emit_pin_added(env: &Env, token_index: u32, pin_index: u32, pinned_by: &Address, uri: &String) {
    env.events().publish(
        (symbol_short!("pin_add"), token_index),
        (pin_index, pinned_by, uri),
    );
}

fn emit_pin_deactivated(env: &Env, token_index: u32, pin_index: u32, deactivated_by: &Address) {
    env.events().publish(
        (symbol_short!("pin_deact"), token_index),
        (pin_index, deactivated_by),
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        storage,
        types::{Error, TokenInfo},
        TokenFactory, TokenFactoryClient,
    };
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    /// Seed a minimal TokenInfo so pin functions can look up creator/admin.
    fn seed_token(env: &Env, contract_id: &Address, token_index: u32, creator: &Address) {
        let info = TokenInfo {
            address: Address::generate(env),
            creator: creator.clone(),
            name: String::from_str(env, "Test"),
            symbol: String::from_str(env, "TST"),
            decimals: 7,
            total_supply: 1_000_000,
            initial_supply: 1_000_000,
            max_supply: None,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: 0,
            is_paused: false,
            clawback_enabled: false,
            freeze_enabled: false,
        };
        env.as_contract(contract_id, || {
            storage::set_token_info(env, token_index, &info);
        });
    }

    fn setup(env: &Env) -> (TokenFactoryClient, Address, Address) {
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let treasury = Address::generate(env);
        client.initialize(&admin, &treasury, &1_000_000, &500_000);
        (client, admin, contract_id)
    }

    fn make_uri(env: &Env, s: &str) -> String {
        String::from_str(env, s)
    }

    // ── add_pin ───────────────────────────────────────────────────────────────

    #[test]
    fn test_add_pin_by_creator_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        let pin_index = env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmTest123")).unwrap()
        });

        assert_eq!(pin_index, 0);
    }

    #[test]
    fn test_add_pin_by_admin_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        let pin_index = env.as_contract(&contract_id, || {
            add_pin(&env, &admin, 0, make_uri(&env, "ipfs://QmAdminPin")).unwrap()
        });

        assert_eq!(pin_index, 0);
    }

    #[test]
    fn test_add_pin_unauthorized_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let stranger = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        let result = env.as_contract(&contract_id, || {
            add_pin(&env, &stranger, 0, make_uri(&env, "ipfs://QmBad"))
        });

        assert_eq!(result, Err(Error::Unauthorized));
    }

    #[test]
    fn test_add_pin_empty_uri_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        let result = env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, ""))
        });

        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_add_pin_nonexistent_token_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);

        let result = env.as_contract(&contract_id, || {
            add_pin(&env, &admin, 99, make_uri(&env, "ipfs://QmX"))
        });

        assert_eq!(result, Err(Error::TokenNotFound));
    }

    #[test]
    fn test_add_pin_limit_enforced() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        // Fill up to MAX_PINS
        for i in 0..MAX_PINS {
            let uri = make_uri(&env, "ipfs://QmPin");
            env.as_contract(&contract_id, || {
                add_pin(&env, &creator, 0, uri).unwrap()
            });
        }

        // One more should fail
        let result = env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmOver"))
        });
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_add_multiple_pins_sequential_indices() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        for expected in 0u32..3 {
            let idx = env.as_contract(&contract_id, || {
                add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmX")).unwrap()
            });
            assert_eq!(idx, expected);
        }
    }

    // ── deactivate_pin ────────────────────────────────────────────────────────

    #[test]
    fn test_deactivate_pin_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmA")).unwrap()
        });

        env.as_contract(&contract_id, || {
            deactivate_pin(&env, &creator, 0, 0).unwrap()
        });

        let pin = env.as_contract(&contract_id, || get_pin(&env, 0, 0)).unwrap();
        assert!(!pin.active);
    }

    #[test]
    fn test_deactivate_already_inactive_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmA")).unwrap()
        });
        env.as_contract(&contract_id, || {
            deactivate_pin(&env, &creator, 0, 0).unwrap()
        });

        let result = env.as_contract(&contract_id, || deactivate_pin(&env, &creator, 0, 0));
        assert_eq!(result, Err(Error::InvalidParameters));
    }

    #[test]
    fn test_deactivate_pin_unauthorized_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        let stranger = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmA")).unwrap()
        });

        let result =
            env.as_contract(&contract_id, || deactivate_pin(&env, &stranger, 0, 0));
        assert_eq!(result, Err(Error::Unauthorized));
    }

    // ── get_pin / get_pin_count / get_active_pin_count ────────────────────────

    #[test]
    fn test_get_pin_roundtrip() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        let uri = make_uri(&env, "ipfs://QmRoundtrip");
        env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, uri.clone()).unwrap()
        });

        let pin = env.as_contract(&contract_id, || get_pin(&env, 0, 0)).unwrap();
        assert_eq!(pin.uri, uri);
        assert_eq!(pin.pinned_by, creator);
        assert!(pin.active);
    }

    #[test]
    fn test_get_pin_count_tracks_all_pins() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        for _ in 0..3 {
            env.as_contract(&contract_id, || {
                add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmX")).unwrap()
            });
        }

        assert_eq!(
            env.as_contract(&contract_id, || get_pin_count(&env, 0)),
            3
        );
    }

    #[test]
    fn test_active_pin_count_excludes_deactivated() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        for _ in 0..3 {
            env.as_contract(&contract_id, || {
                add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmX")).unwrap()
            });
        }
        // Deactivate pin 1
        env.as_contract(&contract_id, || {
            deactivate_pin(&env, &creator, 0, 1).unwrap()
        });

        assert_eq!(
            env.as_contract(&contract_id, || get_active_pin_count(&env, 0)),
            2
        );
    }

    // ── Event emission ────────────────────────────────────────────────────────

    #[test]
    fn test_add_pin_emits_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        let before = env.events().all().len();
        env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmEv")).unwrap()
        });
        assert_eq!(env.events().all().len(), before + 1);
    }

    #[test]
    fn test_deactivate_pin_emits_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmEv")).unwrap()
        });

        let before = env.events().all().len();
        env.as_contract(&contract_id, || {
            deactivate_pin(&env, &creator, 0, 0).unwrap()
        });
        assert_eq!(env.events().all().len(), before + 1);
    }

    // ── Integration ───────────────────────────────────────────────────────────

    #[test]
    fn integration_test_metadata_ipfs_pinning() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);
        let creator = Address::generate(&env);
        seed_token(&env, &contract_id, 0, &creator);

        // Creator adds primary pin
        let p0 = env.as_contract(&contract_id, || {
            add_pin(&env, &creator, 0, make_uri(&env, "ipfs://QmPrimary")).unwrap()
        });
        // Admin adds redundancy pin
        let p1 = env.as_contract(&contract_id, || {
            add_pin(&env, &admin, 0, make_uri(&env, "ipfs://QmRedundant")).unwrap()
        });

        assert_eq!(p0, 0);
        assert_eq!(p1, 1);
        assert_eq!(env.as_contract(&contract_id, || get_active_pin_count(&env, 0)), 2);

        // Deactivate the redundant pin
        env.as_contract(&contract_id, || {
            deactivate_pin(&env, &admin, 0, 1).unwrap()
        });
        assert_eq!(env.as_contract(&contract_id, || get_active_pin_count(&env, 0)), 1);

        // Total count still 2 (audit trail preserved)
        assert_eq!(env.as_contract(&contract_id, || get_pin_count(&env, 0)), 2);
    }
}

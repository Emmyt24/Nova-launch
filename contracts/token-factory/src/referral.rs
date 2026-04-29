/// Referral and affiliate tracking system.
///
/// Allows users to register a referrer when creating a token. A configurable
/// commission (in basis points) of the deployment fee is credited to the
/// referrer's earned balance. The factory admin can update the commission rate
/// and pay out accumulated commissions.
///
/// # Economics
/// * Default commission rate: 500 bps (5 %).
/// * Commission is calculated on the `fee_payment` passed to `create_token`.
/// * Commissions accumulate in storage; the admin triggers payouts explicitly.
/// * A referrer cannot refer themselves.
use soroban_sdk::{Address, Env};

use crate::storage;
use crate::types::{DataKey, Error};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Default commission rate in basis points (5 %).
pub const DEFAULT_COMMISSION_BPS: u32 = 500;
/// Maximum allowed commission rate (20 %).
pub const MAX_COMMISSION_BPS: u32 = 2_000;
/// Basis-point denominator.
const BPS_DENOM: i128 = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Referral relationship stored per referee address.
#[soroban_sdk::contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferralInfo {
    /// The address that referred this user.
    pub referrer: Address,
    /// Ledger timestamp when the referral was registered.
    pub registered_at: u64,
    /// Total tokens deployed by this referee (incremented on each deployment).
    pub deployments: u32,
}

// ── Storage helpers ───────────────────────────────────────────────────────────

fn get_commission_rate(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::ReferralCommissionRate)
        .unwrap_or(DEFAULT_COMMISSION_BPS)
}

fn set_commission_rate(env: &Env, rate: u32) {
    env.storage()
        .instance()
        .set(&DataKey::ReferralCommissionRate, &rate);
}

fn get_referral_info(env: &Env, referee: &Address) -> Option<ReferralInfo> {
    env.storage()
        .persistent()
        .get(&DataKey::ReferralInfo(referee.clone()))
}

fn set_referral_info(env: &Env, referee: &Address, info: &ReferralInfo) {
    env.storage()
        .persistent()
        .set(&DataKey::ReferralInfo(referee.clone()), info);
}

fn get_total_earned(env: &Env, referrer: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::ReferralTotalEarned(referrer.clone()))
        .unwrap_or(0i128)
}

fn set_total_earned(env: &Env, referrer: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::ReferralTotalEarned(referrer.clone()), &amount);
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Register a referral relationship.
///
/// `referee` is the new user; `referrer` is the existing user who brought them.
/// A referee can only register once. A user cannot refer themselves.
///
/// # Errors
/// * `InvalidParameters` – `referee == referrer` or referral already registered.
pub fn register_referral(env: &Env, referee: &Address, referrer: &Address) -> Result<(), Error> {
    if referee == referrer {
        return Err(Error::InvalidParameters);
    }
    if get_referral_info(env, referee).is_some() {
        return Err(Error::InvalidParameters);
    }

    let info = ReferralInfo {
        referrer: referrer.clone(),
        registered_at: env.ledger().timestamp(),
        deployments: 0,
    };
    set_referral_info(env, referee, &info);

    crate::events::emit_referral_registered(env, referee, referrer);
    Ok(())
}

/// Calculate and credit the referral commission for a deployment.
///
/// Called internally after a successful `create_token`. If `creator` has a
/// registered referrer, the commission is added to the referrer's earned
/// balance and the referee's deployment counter is incremented.
///
/// # Returns
/// Commission amount credited (0 if no referral registered).
pub fn credit_commission(env: &Env, creator: &Address, token_index: u32, fee_paid: i128) -> i128 {
    let info = match get_referral_info(env, creator) {
        Some(i) => i,
        None => return 0,
    };

    let rate = get_commission_rate(env) as i128;
    let commission = fee_paid
        .checked_mul(rate)
        .and_then(|v| v.checked_div(BPS_DENOM))
        .unwrap_or(0);

    if commission <= 0 {
        return 0;
    }

    // Accumulate earned balance.
    let prev = get_total_earned(env, &info.referrer);
    let new_total = prev.saturating_add(commission);
    set_total_earned(env, &info.referrer, new_total);

    // Increment referee's deployment count.
    let mut updated = info;
    updated.deployments = updated.deployments.saturating_add(1);
    set_referral_info(env, creator, &updated);

    crate::events::emit_commission_paid(env, &updated.referrer, token_index, commission);

    commission
}

/// Return the referral info for a given referee, if any.
pub fn get_referral(env: &Env, referee: &Address) -> Option<ReferralInfo> {
    get_referral_info(env, referee)
}

/// Return the total commission earned by a referrer.
pub fn get_earned(env: &Env, referrer: &Address) -> i128 {
    get_total_earned(env, referrer)
}

/// Return the current commission rate in basis points.
pub fn get_commission_rate_bps(env: &Env) -> u32 {
    get_commission_rate(env)
}

/// Update the commission rate (admin only).
///
/// # Arguments
/// * `admin`    – Factory admin (must auth).
/// * `rate_bps` – New rate in basis points; must be ≤ `MAX_COMMISSION_BPS`.
///
/// # Errors
/// * `Unauthorized`      – Caller is not the factory admin.
/// * `InvalidParameters` – `rate_bps > MAX_COMMISSION_BPS`.
pub fn set_commission_rate_bps(env: &Env, admin: &Address, rate_bps: u32) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }
    if rate_bps > MAX_COMMISSION_BPS {
        return Err(Error::InvalidParameters);
    }

    set_commission_rate(env, rate_bps);
    crate::events::emit_commission_rate_updated(env, admin, rate_bps);
    Ok(())
}

/// Pay out accumulated commission to a referrer (admin only).
///
/// Resets the referrer's earned balance to zero and emits a payout event.
/// In a production deployment this would trigger an actual token transfer;
/// here it records the payout and resets the balance.
///
/// # Arguments
/// * `admin`    – Factory admin (must auth).
/// * `referrer` – Address to pay out.
///
/// # Returns
/// Amount paid out.
///
/// # Errors
/// * `Unauthorized`      – Caller is not the factory admin.
/// * `InvalidParameters` – Referrer has no earned commission.
pub fn payout_commission(env: &Env, admin: &Address, referrer: &Address) -> Result<i128, Error> {
    admin.require_auth();

    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    let earned = get_total_earned(env, referrer);
    if earned <= 0 {
        return Err(Error::InvalidParameters);
    }

    // Reset balance.
    set_total_earned(env, referrer, 0);

    // In production: transfer `earned` from treasury to referrer.
    // crate::treasury::transfer(env, referrer, earned);

    env.events()
        .publish((soroban_sdk::symbol_short!("ref_pay"),), (referrer, earned));

    Ok(earned)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

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

    #[test]
    fn register_referral_and_credit_commission() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let referrer = Address::generate(&env);
        let referee = Address::generate(&env);

        // Register referral.
        client.register_referral(&referee, &referrer).unwrap();

        // Deploy a token as the referee.
        client
            .create_token(
                &referee,
                &String::from_str(&env, "RefToken"),
                &String::from_str(&env, "RTK"),
                &7_u32,
                &1_000_000_i128,
                &None,
                &1_000_000_i128,
            )
            .unwrap();

        // Commission = 5% of 1_000_000 = 50_000.
        let earned = client.get_referral_earned(&referrer);
        assert_eq!(earned, 50_000_i128);
    }

    #[test]
    fn cannot_refer_self() {
        let (env, contract_id, _admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        let err = client.register_referral(&user, &user).unwrap_err();
        assert_eq!(err, crate::types::Error::InvalidParameters.into());
    }

    #[test]
    fn cannot_register_referral_twice() {
        let (env, contract_id, _admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let referrer = Address::generate(&env);
        let referee = Address::generate(&env);

        client.register_referral(&referee, &referrer).unwrap();
        let err = client.register_referral(&referee, &referrer).unwrap_err();
        assert_eq!(err, crate::types::Error::InvalidParameters.into());
    }

    #[test]
    fn admin_can_update_commission_rate() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        client.set_commission_rate(&admin, &1_000_u32).unwrap();
        assert_eq!(client.get_commission_rate(), 1_000_u32);
    }

    #[test]
    fn commission_rate_above_max_rejected() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let err = client.set_commission_rate(&admin, &3_000_u32).unwrap_err();
        assert_eq!(err, crate::types::Error::InvalidParameters.into());
    }

    #[test]
    fn non_admin_cannot_update_commission_rate() {
        let (env, contract_id, _admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let impostor = Address::generate(&env);
        let err = client.set_commission_rate(&impostor, &100_u32).unwrap_err();
        assert_eq!(err, crate::types::Error::Unauthorized.into());
    }

    #[test]
    fn payout_resets_earned_balance() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let referrer = Address::generate(&env);
        let referee = Address::generate(&env);

        client.register_referral(&referee, &referrer).unwrap();
        client
            .create_token(
                &referee,
                &String::from_str(&env, "RefToken"),
                &String::from_str(&env, "RTK"),
                &7_u32,
                &1_000_000_i128,
                &None,
                &1_000_000_i128,
            )
            .unwrap();

        let paid = client.payout_commission(&admin, &referrer).unwrap();
        assert_eq!(paid, 50_000_i128);

        // Balance should be reset.
        assert_eq!(client.get_referral_earned(&referrer), 0_i128);
    }

    #[test]
    fn payout_with_zero_balance_returns_error() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        let referrer = Address::generate(&env);
        let err = client.payout_commission(&admin, &referrer).unwrap_err();
        assert_eq!(err, crate::types::Error::InvalidParameters.into());
    }

    #[test]
    fn no_referral_means_zero_commission() {
        let (env, contract_id, admin, _treasury) = setup();
        let client = crate::TokenFactoryClient::new(&env, &contract_id);

        // Deploy without registering a referral.
        client
            .create_token(
                &admin,
                &String::from_str(&env, "NoRef"),
                &String::from_str(&env, "NRF"),
                &7_u32,
                &1_000_000_i128,
                &None,
                &1_000_000_i128,
            )
            .unwrap();

        // No referrer — earned should be 0.
        assert_eq!(client.get_referral_earned(&admin), 0_i128);
    }
}

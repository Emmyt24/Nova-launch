//! Automated Compliance Reporting Module
//!
//! Provides on-chain compliance snapshots for regulatory requirements.
//! Reports aggregate token supply, burn activity, and governance state
//! without exposing individual holder PII.
//!
//! # Design
//! - All report data is derived from existing on-chain state (no new storage
//!   beyond the report record itself).
//! - Reports are append-only; once generated they cannot be mutated.
//! - Only the contract admin may generate a report (privileged operation).
//! - Events are emitted for every generated report so off-chain indexers can
//!   build a full audit trail.
//!
//! # Security (OWASP)
//! - Authorization enforced via `require_auth` + admin address check.
//! - No user-supplied data is stored verbatim; all fields are derived from
//!   validated on-chain state.
//! - Integer arithmetic uses checked operations to prevent overflow.

use crate::{events, storage, types::Error};
use soroban_sdk::{contracttype, symbol_short, Address, Env, Vec};

// ── Types ────────────────────────────────────────────────────────────────────

/// Immutable compliance snapshot for a single reporting period.
///
/// # Fields
/// * `report_id`       – Monotonically increasing identifier.
/// * `generated_at`    – Ledger timestamp when the report was created.
/// * `generated_by`    – Admin address that triggered generation.
/// * `token_count`     – Total number of tokens registered in the factory.
/// * `total_supply`    – Aggregate circulating supply across all tokens.
/// * `total_burned`    – Aggregate tokens burned across all tokens.
/// * `total_burn_ops`  – Total number of individual burn operations.
/// * `governance_quorum_percent`  – Current governance quorum threshold.
/// * `governance_approval_percent`– Current governance approval threshold.
/// * `contract_paused` – Whether the factory was paused at report time.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComplianceReport {
    pub report_id: u64,
    pub generated_at: u64,
    pub generated_by: Address,
    pub token_count: u32,
    pub total_supply: i128,
    pub total_burned: i128,
    pub total_burn_ops: u32,
    pub governance_quorum_percent: u32,
    pub governance_approval_percent: u32,
    pub contract_paused: bool,
}

/// Storage key for compliance reports.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ComplianceKey {
    /// Individual report by ID.
    Report(u64),
    /// Monotonic counter for the next report ID.
    ReportCount,
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Generate a new compliance report and persist it on-chain.
///
/// Collects aggregate metrics from existing contract state and stores an
/// immutable snapshot. Emits a `cmp_rpt` event for off-chain indexers.
///
/// # Arguments
/// * `env`   – The contract environment.
/// * `admin` – Admin address (must authorize and match stored admin).
///
/// # Returns
/// The newly created `ComplianceReport`.
///
/// # Errors
/// * `Error::Unauthorized`      – Caller is not the admin.
/// * `Error::ArithmeticError`   – Report ID counter overflowed (extremely unlikely).
pub fn generate_report(env: &Env, admin: &Address) -> Result<ComplianceReport, Error> {
    // ── Authorization ────────────────────────────────────────────────────────
    admin.require_auth();
    let stored_admin = storage::get_admin(env);
    if *admin != stored_admin {
        return Err(Error::Unauthorized);
    }

    // ── Aggregate metrics ────────────────────────────────────────────────────
    let token_count = storage::get_token_count(env);
    let (total_supply, total_burned, total_burn_ops) = aggregate_token_metrics(env, token_count);

    let gov_config = storage::get_governance_config(env);
    let contract_paused = storage::is_paused(env);

    // ── Assign report ID ─────────────────────────────────────────────────────
    let report_id = next_report_id(env)?;

    let report = ComplianceReport {
        report_id,
        generated_at: env.ledger().timestamp(),
        generated_by: admin.clone(),
        token_count,
        total_supply,
        total_burned,
        total_burn_ops,
        governance_quorum_percent: gov_config.quorum_percent,
        governance_approval_percent: gov_config.approval_percent,
        contract_paused,
    };

    // ── Persist (append-only) ────────────────────────────────────────────────
    env.storage()
        .persistent()
        .set(&ComplianceKey::Report(report_id), &report);

    // ── Emit event ───────────────────────────────────────────────────────────
    emit_report_generated(env, report_id, admin, token_count, total_supply, total_burned);

    Ok(report)
}

/// Retrieve a previously generated compliance report by ID.
///
/// # Arguments
/// * `env`       – The contract environment.
/// * `report_id` – The report identifier returned by `generate_report`.
///
/// # Returns
/// `Some(ComplianceReport)` if found, `None` otherwise.
pub fn get_report(env: &Env, report_id: u64) -> Option<ComplianceReport> {
    env.storage()
        .persistent()
        .get(&ComplianceKey::Report(report_id))
}

/// Return the total number of compliance reports generated so far.
pub fn get_report_count(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&ComplianceKey::ReportCount)
        .unwrap_or(0)
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/// Walk all registered tokens and sum supply / burned / burn-op metrics.
///
/// Uses saturating arithmetic for the aggregate sums so a single corrupted
/// token entry cannot cause the entire report to fail.
fn aggregate_token_metrics(env: &Env, token_count: u32) -> (i128, i128, u32) {
    let mut total_supply: i128 = 0;
    let mut total_burned: i128 = 0;
    let mut total_burn_ops: u32 = 0;

    for i in 0..token_count {
        if let Some(info) = storage::get_token_info(env, i) {
            total_supply = total_supply.saturating_add(info.total_supply);
            total_burned = total_burned.saturating_add(info.total_burned);
            total_burn_ops = total_burn_ops.saturating_add(info.burn_count);
        }
    }

    (total_supply, total_burned, total_burn_ops)
}

/// Atomically increment and return the next report ID.
fn next_report_id(env: &Env) -> Result<u64, Error> {
    let current: u64 = env
        .storage()
        .persistent()
        .get(&ComplianceKey::ReportCount)
        .unwrap_or(0);

    let next = current.checked_add(1).ok_or(Error::ArithmeticError)?;
    env.storage()
        .persistent()
        .set(&ComplianceKey::ReportCount, &next);

    Ok(current) // report IDs are 0-based
}

/// Emit compliance report generated event.
///
/// **Event Name**: `cmp_rpt`
///
/// **Topics** (indexed):
/// - `"cmp_rpt"` – event discriminator
/// - `report_id: u64`
///
/// **Payload** (non-indexed):
/// - `generated_by: Address`
/// - `token_count: u32`
/// - `total_supply: i128`
/// - `total_burned: i128`
fn emit_report_generated(
    env: &Env,
    report_id: u64,
    generated_by: &Address,
    token_count: u32,
    total_supply: i128,
    total_burned: i128,
) {
    env.events().publish(
        (symbol_short!("cmp_rpt"), report_id),
        (generated_by, token_count, total_supply, total_burned),
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{TokenFactory, TokenFactoryClient};
    use soroban_sdk::{testutils::Address as _, Address, Env};

    /// Deploy factory and return (client, admin, contract_id).
    fn setup(env: &Env) -> (TokenFactoryClient, Address, Address) {
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let treasury = Address::generate(env);
        client.initialize(&admin, &treasury, &1_000_000, &500_000);
        (client, admin, contract_id)
    }

    // ── generate_report ───────────────────────────────────────────────────────

    /// Happy path: admin generates a report and gets back a valid snapshot.
    #[test]
    fn test_generate_report_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);

        let report = env.as_contract(&contract_id, || {
            generate_report(&env, &admin).unwrap()
        });

        assert_eq!(report.report_id, 0);
        assert_eq!(report.generated_by, admin);
        assert_eq!(report.token_count, 0);
        assert_eq!(report.total_supply, 0);
        assert_eq!(report.total_burned, 0);
        assert_eq!(report.total_burn_ops, 0);
        assert!(!report.contract_paused);
    }

    /// Report IDs increment monotonically.
    #[test]
    fn test_report_ids_are_sequential() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);

        let r0 = env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        let r1 = env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        let r2 = env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());

        assert_eq!(r0.report_id, 0);
        assert_eq!(r1.report_id, 1);
        assert_eq!(r2.report_id, 2);
    }

    /// Non-admin cannot generate a report.
    #[test]
    fn test_generate_report_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);
        let non_admin = Address::generate(&env);

        let result = env.as_contract(&contract_id, || generate_report(&env, &non_admin));
        assert_eq!(result, Err(Error::Unauthorized));
    }

    /// Report reflects paused state correctly.
    #[test]
    fn test_report_reflects_paused_state() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, contract_id) = setup(&env);

        client.pause(&admin);

        let report = env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        assert!(report.contract_paused);
    }

    // ── get_report ────────────────────────────────────────────────────────────

    /// Generated report can be retrieved by ID.
    #[test]
    fn test_get_report_roundtrip() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);

        let generated = env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        let retrieved = env
            .as_contract(&contract_id, || get_report(&env, generated.report_id))
            .unwrap();

        assert_eq!(generated, retrieved);
    }

    /// Querying a non-existent report returns None.
    #[test]
    fn test_get_report_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, _, contract_id) = setup(&env);

        let result = env.as_contract(&contract_id, || get_report(&env, 999));
        assert!(result.is_none());
    }

    // ── get_report_count ──────────────────────────────────────────────────────

    /// Count starts at zero and increments with each report.
    #[test]
    fn test_report_count_increments() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);

        assert_eq!(env.as_contract(&contract_id, || get_report_count(&env)), 0);

        env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        assert_eq!(env.as_contract(&contract_id, || get_report_count(&env)), 1);

        env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        assert_eq!(env.as_contract(&contract_id, || get_report_count(&env)), 2);
    }

    // ── Event emission ────────────────────────────────────────────────────────

    /// Generating a report emits exactly one `cmp_rpt` event.
    #[test]
    fn test_generate_report_emits_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);

        let before = env.events().all().len();
        env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        let after = env.events().all().len();

        assert_eq!(after, before + 1, "Exactly one event should be emitted");
    }

    // ── Immutability ──────────────────────────────────────────────────────────

    /// A stored report cannot be overwritten by generating a new one.
    #[test]
    fn test_reports_are_immutable() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);

        let r0 = env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        // Generate a second report (different ID)
        env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());

        // First report must be unchanged
        let r0_again = env
            .as_contract(&contract_id, || get_report(&env, 0))
            .unwrap();
        assert_eq!(r0, r0_again);
    }

    // ── Governance fields ─────────────────────────────────────────────────────

    /// Report captures governance config at time of generation.
    #[test]
    fn test_report_captures_governance_config() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, contract_id) = setup(&env);

        // Update governance config
        client.update_governance_config(&admin, &Some(40u32), &Some(65u32));

        let report = env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
        assert_eq!(report.governance_quorum_percent, 40);
        assert_eq!(report.governance_approval_percent, 65);
    }

    // ── integration_test ──────────────────────────────────────────────────────

    /// Full integration: generate multiple reports and verify count + retrieval.
    #[test]
    fn integration_test_compliance_reporting() {
        let env = Env::default();
        env.mock_all_auths();
        let (_, admin, contract_id) = setup(&env);

        for expected_id in 0u64..5 {
            let report =
                env.as_contract(&contract_id, || generate_report(&env, &admin).unwrap());
            assert_eq!(report.report_id, expected_id);
        }

        assert_eq!(env.as_contract(&contract_id, || get_report_count(&env)), 5);

        // All reports retrievable
        for id in 0u64..5 {
            assert!(env.as_contract(&contract_id, || get_report(&env, id)).is_some());
        }
    }
}

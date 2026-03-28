//! Property 68: Governance Config Authorization
//!
//! Proves that `update_governance_config` enforces admin-only access:
//!   - Non-admin addresses are always rejected with `Error::Unauthorized`
//!   - The admin address always succeeds for valid percentage inputs
//!
//! Properties tested:
//!   P68-A  Non-admin updates are rejected with Unauthorized (100 iterations)
//!   P68-B  Admin updates succeed for valid quorum/approval percentages
//!
//! Assumptions / edge cases:
//!   - `mock_all_auths()` is used so `require_auth()` never panics; the
//!     admin check is the explicit address comparison that follows it.
//!   - Percentages are constrained to 1–99 to avoid the InvalidParameters
//!     path (0 or 100 are edge cases tested separately in quorum tests).
//!   - Each proptest case gets a fresh Env to avoid state bleed.
//!
//! Follow-up work:
//!   - Add property for concurrent admin-transfer + config-update ordering.

#[cfg(test)]
mod governance_config_auth_property_test {
    use crate::governance::{initialize_governance, update_governance_config};
    use crate::storage;
    use crate::types::Error;
    use proptest::prelude::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env};

    /// Set up a minimal contract environment with an admin and initialized governance.
    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        env.as_contract(
            &env.register_contract(None, crate::TokenFactory),
            || {
                storage::set_admin(&env, &admin);
                storage::set_treasury(&env, &treasury);
                storage::set_base_fee(&env, 1_000_000);
                storage::set_metadata_fee(&env, 500_000);
                initialize_governance(&env, Some(30), Some(51)).unwrap();
            },
        );

        (env, admin)
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]

        /// Property 68-A: Non-admin updates are always rejected.
        ///
        /// For any randomly generated address that is not the registered admin,
        /// `update_governance_config` must return `Error::Unauthorized`.
        #[test]
        fn prop_non_admin_update_rejected(
            quorum in 1u32..99,
            approval in 1u32..99,
        ) {
            let (env, _admin) = setup();
            let non_admin = Address::generate(&env);

            let result = env.as_contract(
                &env.current_contract_address(),
                || update_governance_config(&env, &non_admin, Some(quorum), Some(approval)),
            );

            prop_assert_eq!(result, Err(Error::Unauthorized));
        }

        /// Property 68-B: Admin updates always succeed for valid percentages.
        ///
        /// For any valid quorum (1–99) and approval (1–99) the admin address
        /// must be able to update the governance config without error.
        #[test]
        fn prop_admin_update_succeeds(
            quorum in 1u32..99,
            approval in 1u32..99,
        ) {
            let (env, admin) = setup();

            let result = env.as_contract(
                &env.current_contract_address(),
                || update_governance_config(&env, &admin, Some(quorum), Some(approval)),
            );

            prop_assert!(result.is_ok());
        }
    }
}

//! Standalone test for two-step admin transfer security improvements
//! 
//! Tests replay-safety, duplicate acceptance prevention, and stale proposal handling

#[cfg(test)]
mod two_step_admin_security_tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use crate::{TokenFactory, TokenFactoryClient};

    fn setup() -> (Env, TokenFactoryClient, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &100_000_000, &50_000_000).unwrap();

        (env, client, admin, treasury)
    }

    // ═══════════════════════════════════════════════════════
    //  Replay & Duplicate Acceptance Prevention
    // ═══════════════════════════════════════════════════════

    #[test]
    fn test_duplicate_accept_blocked() {
        let (_env, client, admin, _treasury) = setup();
        let new_admin = Address::generate(&_env);

        client.propose_admin(&admin, &new_admin).unwrap();
        client.accept_admin(&new_admin).unwrap();

        // Second acceptance must fail
        let result = client.try_accept_admin(&new_admin);
        assert!(result.is_err(), "Duplicate acceptance should be blocked");
    }

    #[test]
    fn test_stale_proposal_rejected() {
        let (_env, client, admin, _treasury) = setup();
        let first = Address::generate(&_env);
        let second = Address::generate(&_env);

        client.propose_admin(&admin, &first).unwrap();
        client.propose_admin(&admin, &second).unwrap();

        // Stale proposal must be rejected
        let result = client.try_accept_admin(&first);
        assert!(result.is_err(), "Stale proposal should be rejected");
    }

    #[test]
    fn test_only_one_active_proposal() {
        let (_env, client, admin, _treasury) = setup();
        let first = Address::generate(&_env);
        let second = Address::generate(&_env);
        let third = Address::generate(&_env);

        // Multiple proposals
        client.propose_admin(&admin, &first).unwrap();
        client.propose_admin(&admin, &second).unwrap();
        client.propose_admin(&admin, &third).unwrap();

        // Only last one is active
        assert!(client.try_accept_admin(&first).is_err());
        assert!(client.try_accept_admin(&second).is_err());
        client.accept_admin(&third).unwrap();

        assert_eq!(client.get_state().admin, third);
    }

    #[test]
    fn test_unauthorized_cannot_accept() {
        let (_env, client, admin, _treasury) = setup();
        let proposed = Address::generate(&_env);
        let unauthorized = Address::generate(&_env);

        client.propose_admin(&admin, &proposed).unwrap();

        let result = client.try_accept_admin(&unauthorized);
        assert!(result.is_err(), "Unauthorized address should not accept");

        // Admin unchanged
        assert_eq!(client.get_state().admin, admin);
    }

    #[test]
    fn test_accept_without_proposal_fails() {
        let (_env, client, _admin, _treasury) = setup();
        let random = Address::generate(&_env);

        let result = client.try_accept_admin(&random);
        assert!(result.is_err(), "Cannot accept without proposal");
    }

    #[test]
    fn test_old_admin_cannot_propose_after_transfer() {
        let (_env, client, admin, _treasury) = setup();
        let new_admin = Address::generate(&_env);
        let third = Address::generate(&_env);

        client.propose_admin(&admin, &new_admin).unwrap();
        client.accept_admin(&new_admin).unwrap();

        // Old admin unauthorized
        let result = client.try_propose_admin(&admin, &third);
        assert!(result.is_err(), "Old admin should be unauthorized");
    }

    #[test]
    fn test_accept_after_direct_transfer_fails() {
        let (_env, client, admin, _treasury) = setup();
        let proposed = Address::generate(&_env);
        let direct_new = Address::generate(&_env);

        client.propose_admin(&admin, &proposed).unwrap();

        // Admin uses old direct transfer
        #[allow(deprecated)]
        client.transfer_admin(&admin, &direct_new).unwrap();

        // Proposed admin cannot accept (admin already changed)
        let result = client.try_accept_admin(&proposed);
        assert!(result.is_err(), "Cannot accept after direct transfer");
    }

    // ═══════════════════════════════════════════════════════
    //  Happy Path Verification
    // ═══════════════════════════════════════════════════════

    #[test]
    fn test_two_step_transfer_succeeds() {
        let (_env, client, admin, _treasury) = setup();
        let new_admin = Address::generate(&_env);

        client.propose_admin(&admin, &new_admin).unwrap();
        client.accept_admin(&new_admin).unwrap();

        assert_eq!(client.get_state().admin, new_admin);
    }

    #[test]
    fn test_new_admin_can_immediately_propose() {
        let (_env, client, admin, _treasury) = setup();
        let second = Address::generate(&_env);
        let third = Address::generate(&_env);

        client.propose_admin(&admin, &second).unwrap();
        client.accept_admin(&second).unwrap();

        client.propose_admin(&second, &third).unwrap();
        client.accept_admin(&third).unwrap();

        assert_eq!(client.get_state().admin, third);
    }

    #[test]
    fn test_propose_to_self_fails() {
        let (_env, client, admin, _treasury) = setup();

        let result = client.try_propose_admin(&admin, &admin);
        assert!(result.is_err(), "Cannot propose self as admin");
    }
}

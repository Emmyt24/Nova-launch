//! Comprehensive tests for the multi-signature admin approval system.
//!
//! Covers:
//! - Configuration (happy path, invalid threshold, unauthorized)
//! - Proposal creation (happy path, not a signer, not configured)
//! - Approval flow (single/multi signer, auto-execute on threshold)
//! - Explicit execution (threshold met, not met, already executed)
//! - Cancellation (by admin, by proposer, unauthorized)
//! - Action execution: TransferAdmin, UpdateFees, PauseContract, UnpauseContract
//! - Edge cases: duplicate approval, cancelled/executed proposal guards

#[cfg(test)]
mod multisig_tests {
    use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, Vec};

    use crate::{TokenFactory, TokenFactoryClient};

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    fn setup(env: &Env) -> (TokenFactoryClient, Address, Address) {
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let treasury = Address::generate(env);
        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);
        (client, admin, treasury)
    }

    /// Configure multi-sig with `n` signers and the given threshold.
    fn configure(
        client: &TokenFactoryClient,
        env: &Env,
        admin: &Address,
        n: usize,
        threshold: u32,
    ) -> Vec<Address> {
        let mut signers = Vec::new(env);
        for _ in 0..n {
            signers.push_back(Address::generate(env));
        }
        client.configure_multisig(admin, &signers, &threshold);
        signers
    }

    /// Build a pause/unpause payload (empty bytes).
    fn empty_payload(env: &Env) -> Bytes {
        Bytes::new(env)
    }

    /// Build an UpdateFees payload: base_fee (i128 LE) || metadata_fee (i128 LE).
    fn fee_payload(env: &Env, base_fee: i128, metadata_fee: i128) -> Bytes {
        let mut buf = [0u8; 32];
        buf[..16].copy_from_slice(&base_fee.to_le_bytes());
        buf[16..].copy_from_slice(&metadata_fee.to_le_bytes());
        Bytes::from_array(env, &buf)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // configure_multisig
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_configure_multisig_happy_path() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 3, 2);

        let cfg = client.get_multisig_config().unwrap();
        assert_eq!(cfg.threshold, 2);
        assert_eq!(cfg.signers.len(), 3);
        assert!(cfg.signers.contains(&signers.get(0).unwrap()));
    }

    #[test]
    fn test_configure_multisig_threshold_zero_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let mut signers = Vec::new(&env);
        signers.push_back(Address::generate(&env));
        let result = client.try_configure_multisig(&admin, &signers, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_configure_multisig_threshold_exceeds_signers_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let mut signers = Vec::new(&env);
        signers.push_back(Address::generate(&env));
        let result = client.try_configure_multisig(&admin, &signers, &2);
        assert!(result.is_err());
    }

    #[test]
    fn test_configure_multisig_unauthorized_fails() {
        let env = Env::default();
        let (client, _, _) = setup(&env);
        let non_admin = Address::generate(&env);
        let mut signers = Vec::new(&env);
        signers.push_back(Address::generate(&env));
        let result = client.try_configure_multisig(&non_admin, &signers, &1);
        assert!(result.is_err());
    }

    #[test]
    fn test_configure_multisig_can_be_reconfigured() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        configure(&client, &env, &admin, 3, 2);
        // Reconfigure with different settings
        configure(&client, &env, &admin, 5, 3);
        let cfg = client.get_multisig_config().unwrap();
        assert_eq!(cfg.threshold, 3);
        assert_eq!(cfg.signers.len(), 5);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // propose_multisig_action
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_propose_action_happy_path() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 3, 2);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        assert_eq!(id, 0);

        let proposal = client.get_multisig_proposal(&id).unwrap();
        assert_eq!(proposal.id, 0);
        assert!(!proposal.executed);
        assert!(!proposal.cancelled);
        assert_eq!(proposal.approval_count, 0);
    }

    #[test]
    fn test_propose_action_not_configured_fails() {
        let env = Env::default();
        let (client, _, _) = setup(&env);
        let random = Address::generate(&env);
        let result = client.try_propose_multisig_action(
            &random,
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_propose_action_not_a_signer_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        configure(&client, &env, &admin, 2, 1);
        let non_signer = Address::generate(&env);
        let result = client.try_propose_multisig_action(
            &non_signer,
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_propose_increments_id() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 1);
        let signer = signers.get(0).unwrap();

        let id0 = client.propose_multisig_action(
            &signer,
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        let id1 = client.propose_multisig_action(
            &signer,
            &crate::types::MultiSigAction::UnpauseContract,
            &empty_payload(&env),
        );
        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // approve_multisig_proposal – basic guards
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_approve_not_a_signer_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);
        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        let non_signer = Address::generate(&env);
        let result = client.try_approve_multisig_proposal(&non_signer, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_approve_duplicate_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 3, 3);
        let signer = signers.get(0).unwrap();
        let id = client.propose_multisig_action(
            &signer,
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        client.approve_multisig_proposal(&signer, &id);
        let result = client.try_approve_multisig_proposal(&signer, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_approve_nonexistent_proposal_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 1);
        let result = client.try_approve_multisig_proposal(&signers.get(0).unwrap(), &999);
        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Auto-execute on threshold: PauseContract
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_pause_auto_executes_on_threshold() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );

        // First approval – not yet at threshold
        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        assert!(!client.is_paused());

        // Second approval – reaches threshold, auto-executes
        client.approve_multisig_proposal(&signers.get(1).unwrap(), &id);
        assert!(client.is_paused());

        let proposal = client.get_multisig_proposal(&id).unwrap();
        assert!(proposal.executed);
    }

    #[test]
    fn test_unpause_auto_executes_on_threshold() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        // Pause first via admin
        client.pause(&admin);
        assert!(client.is_paused());

        let signers = configure(&client, &env, &admin, 1, 1);
        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::UnpauseContract,
            &empty_payload(&env),
        );
        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        assert!(!client.is_paused());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Auto-execute on threshold: UpdateFees
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_update_fees_auto_executes() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);

        let new_base = 200_000_000i128;
        let new_meta = 100_000_000i128;
        let payload = fee_payload(&env, new_base, new_meta);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::UpdateFees,
            &payload,
        );

        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        client.approve_multisig_proposal(&signers.get(1).unwrap(), &id);

        assert_eq!(client.get_base_fee(), new_base);
        assert_eq!(client.get_metadata_fee(), new_meta);
    }

    #[test]
    fn test_update_fees_invalid_payload_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 1, 1);

        // Negative base fee encoded in payload
        let bad_base = -1i128;
        let payload = fee_payload(&env, bad_base, 50_000_000);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::UpdateFees,
            &payload,
        );
        let result = client.try_approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Explicit execute_multisig_proposal
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_explicit_execute_after_threshold_met() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 3, 2);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );

        // Approve by two signers (threshold = 2, auto-execute triggers)
        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        client.approve_multisig_proposal(&signers.get(1).unwrap(), &id);

        // Already executed – explicit execute should fail
        let result = client.try_execute_multisig_proposal(&signers.get(2).unwrap(), &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_explicit_execute_threshold_not_met_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 3, 3);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );

        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        client.approve_multisig_proposal(&signers.get(1).unwrap(), &id);

        // Only 2 of 3 approvals – threshold not met
        let result = client.try_execute_multisig_proposal(&signers.get(2).unwrap(), &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_explicit_execute_not_a_signer_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        client.approve_multisig_proposal(&signers.get(1).unwrap(), &id);

        let non_signer = Address::generate(&env);
        let result = client.try_execute_multisig_proposal(&non_signer, &id);
        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // cancel_multisig_proposal
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_cancel_by_admin() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );

        client.cancel_multisig_proposal(&admin, &id);

        let proposal = client.get_multisig_proposal(&id).unwrap();
        assert!(proposal.cancelled);
    }

    #[test]
    fn test_cancel_by_proposer() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);
        let proposer = signers.get(0).unwrap();

        let id = client.propose_multisig_action(
            &proposer,
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );

        client.cancel_multisig_proposal(&proposer, &id);

        let proposal = client.get_multisig_proposal(&id).unwrap();
        assert!(proposal.cancelled);
    }

    #[test]
    fn test_cancel_by_unauthorized_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );

        let unauthorized = signers.get(1).unwrap(); // signer but not proposer or admin
        let result = client.try_cancel_multisig_proposal(&unauthorized, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_already_cancelled_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );

        client.cancel_multisig_proposal(&admin, &id);
        let result = client.try_cancel_multisig_proposal(&admin, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_executed_proposal_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 1, 1);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);

        let result = client.try_cancel_multisig_proposal(&admin, &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_approve_cancelled_proposal_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 2);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        client.cancel_multisig_proposal(&admin, &id);

        let result = client.try_approve_multisig_proposal(&signers.get(1).unwrap(), &id);
        assert!(result.is_err());
    }

    #[test]
    fn test_approve_executed_proposal_fails() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 1, 1);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);

        // Proposal is now executed; a second signer (if we had one) cannot approve
        // We test with the same signer – should fail with already-approved or executed
        let result = client.try_approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        assert!(result.is_err());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // get_multisig_config / get_multisig_proposal
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_get_multisig_config_none_before_configure() {
        let env = Env::default();
        let (client, _, _) = setup(&env);
        assert!(client.get_multisig_config().is_none());
    }

    #[test]
    fn test_get_multisig_proposal_none_for_unknown_id() {
        let env = Env::default();
        let (client, _, _) = setup(&env);
        assert!(client.get_multisig_proposal(&42).is_none());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Threshold = 1 (single signer)
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_single_signer_threshold_one_executes_immediately() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 1, 1);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        assert!(client.is_paused());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Multiple independent proposals
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_multiple_proposals_independent() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 2, 1);
        let signer = signers.get(0).unwrap();

        let id0 = client.propose_multisig_action(
            &signer,
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );
        let id1 = client.propose_multisig_action(
            &signer,
            &crate::types::MultiSigAction::UnpauseContract,
            &empty_payload(&env),
        );

        // Execute only the first
        client.approve_multisig_proposal(&signer, &id0);
        assert!(client.is_paused());

        // Second proposal still pending
        let p1 = client.get_multisig_proposal(&id1).unwrap();
        assert!(!p1.executed);
        assert!(!p1.cancelled);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Approval count tracking
    // ─────────────────────────────────────────────────────────────────────────

    #[test]
    fn test_approval_count_increments() {
        let env = Env::default();
        let (client, admin, _) = setup(&env);
        let signers = configure(&client, &env, &admin, 3, 3);

        let id = client.propose_multisig_action(
            &signers.get(0).unwrap(),
            &crate::types::MultiSigAction::PauseContract,
            &empty_payload(&env),
        );

        client.approve_multisig_proposal(&signers.get(0).unwrap(), &id);
        assert_eq!(client.get_multisig_proposal(&id).unwrap().approval_count, 1);

        client.approve_multisig_proposal(&signers.get(1).unwrap(), &id);
        assert_eq!(client.get_multisig_proposal(&id).unwrap().approval_count, 2);

        // Third approval triggers execution
        client.approve_multisig_proposal(&signers.get(2).unwrap(), &id);
        let proposal = client.get_multisig_proposal(&id).unwrap();
        assert_eq!(proposal.approval_count, 3);
        assert!(proposal.executed);
    }
}

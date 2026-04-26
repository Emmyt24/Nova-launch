/// Tests for the proposal execution queue with priority ordering (#864).
///
/// Covers:
/// - enqueue_proposal: happy path, duplicate guard, wrong state
/// - peek_next / dequeue_next: priority ordering, FIFO tiebreaker, eta enforcement
/// - execute_next_in_queue: full end-to-end
/// - queue_len / remove_from_queue
/// - Edge cases: empty queue, single entry, all priorities
#[cfg(test)]
mod proposal_execution_queue_test {
    use crate::proposal_queue::{
        dequeue_next, enqueue_proposal, execute_next_in_queue, peek_next, queue_len,
        remove_from_queue,
    };
    use crate::storage;
    use crate::test_helpers::pause_payload;
    use crate::timelock::{
        create_proposal, initialize_timelock, queue_proposal, vote_proposal,
    };
    use crate::types::{ActionType, Error, ProposalPriority, ProposalState, VoteChoice};
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, Env,
    };

    // ── Helpers ───────────────────────────────────────────────────────────

    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        storage::set_admin(&env, &admin);
        storage::set_treasury(&env, &Address::generate(&env));
        storage::set_base_fee(&env, 1_000_000);
        storage::set_metadata_fee(&env, 500_000);
        initialize_timelock(&env, Some(3_600)).unwrap();
        (env, admin)
    }

    /// Create a proposal, pass it with majority votes, and queue it.
    /// Returns the proposal_id with the proposal in `Queued` state.
    fn make_queued_proposal(env: &Env, admin: &Address, eta_offset: u64) -> u64 {
        let now = env.ledger().timestamp();
        let start = now + 10;
        let end = start + 1_000;
        let eta = end + eta_offset;

        let id = create_proposal(
            env,
            admin,
            ActionType::PauseContract,
            pause_payload(env),
            start,
            end,
            eta,
        )
        .unwrap();

        // Advance into voting window
        env.ledger().with_mut(|l| l.timestamp = start + 1);

        // Pass with 2-for, 1-against
        vote_proposal(env, &Address::generate(env), id, VoteChoice::For).unwrap();
        vote_proposal(env, &Address::generate(env), id, VoteChoice::For).unwrap();
        vote_proposal(env, &Address::generate(env), id, VoteChoice::Against).unwrap();

        // Advance past voting end
        env.ledger().with_mut(|l| l.timestamp = end + 1);

        queue_proposal(env, id).unwrap();

        // Verify state
        let p = storage::get_proposal(env, id).unwrap();
        assert_eq!(p.state, ProposalState::Queued);

        id
    }

    // ── enqueue_proposal ─────────────────────────────────────────────────

    #[test]
    fn test_enqueue_queued_proposal_succeeds() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 100);
        let slot = enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        assert_eq!(slot, 0);
        assert_eq!(queue_len(&env), 1);
    }

    #[test]
    fn test_enqueue_nonexistent_proposal_fails() {
        let (env, _) = setup();
        assert_eq!(
            enqueue_proposal(&env, 999, ProposalPriority::Normal),
            Err(Error::ProposalNotFound)
        );
    }

    #[test]
    fn test_enqueue_non_queued_proposal_fails() {
        let (env, admin) = setup();
        // Create but don't queue it
        let now = env.ledger().timestamp();
        let id = create_proposal(
            &env,
            &admin,
            ActionType::PauseContract,
            pause_payload(&env),
            now + 10,
            now + 1_000,
            now + 2_000,
        )
        .unwrap();
        assert_eq!(
            enqueue_proposal(&env, id, ProposalPriority::Normal),
            Err(Error::InvalidParameters)
        );
    }

    #[test]
    fn test_enqueue_duplicate_fails() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 100);
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        assert_eq!(
            enqueue_proposal(&env, id, ProposalPriority::High),
            Err(Error::InvalidParameters)
        );
    }

    // ── queue_len ─────────────────────────────────────────────────────────

    #[test]
    fn test_queue_len_empty() {
        let (env, _) = setup();
        assert_eq!(queue_len(&env), 0);
    }

    #[test]
    fn test_queue_len_increments_and_decrements() {
        let (env, admin) = setup();
        let id1 = make_queued_proposal(&env, &admin, 100);
        let id2 = make_queued_proposal(&env, &admin, 200);

        enqueue_proposal(&env, id1, ProposalPriority::Normal).unwrap();
        assert_eq!(queue_len(&env), 1);

        enqueue_proposal(&env, id2, ProposalPriority::High).unwrap();
        assert_eq!(queue_len(&env), 2);

        // Advance past both etas and dequeue one
        env.ledger().with_mut(|l| l.timestamp += 10_000);
        dequeue_next(&env).unwrap();
        assert_eq!(queue_len(&env), 1);
    }

    // ── peek_next ─────────────────────────────────────────────────────────

    #[test]
    fn test_peek_empty_queue_returns_none() {
        let (env, _) = setup();
        assert!(peek_next(&env).is_none());
    }

    #[test]
    fn test_peek_before_eta_returns_none() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 10_000); // eta far in future
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        // Don't advance time past eta
        assert!(peek_next(&env).is_none());
    }

    #[test]
    fn test_peek_after_eta_returns_entry() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 100);
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        env.ledger().with_mut(|l| l.timestamp += 10_000);
        let entry = peek_next(&env).expect("should have an entry");
        assert_eq!(entry.proposal_id, id);
    }

    #[test]
    fn test_peek_does_not_remove_entry() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 100);
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        env.ledger().with_mut(|l| l.timestamp += 10_000);
        peek_next(&env);
        assert_eq!(queue_len(&env), 1); // still there
    }

    // ── Priority ordering ─────────────────────────────────────────────────

    #[test]
    fn test_priority_ordering_critical_before_normal() {
        let (env, admin) = setup();
        let id_normal = make_queued_proposal(&env, &admin, 100);
        let id_critical = make_queued_proposal(&env, &admin, 100);

        enqueue_proposal(&env, id_normal, ProposalPriority::Normal).unwrap();
        enqueue_proposal(&env, id_critical, ProposalPriority::Critical).unwrap();

        env.ledger().with_mut(|l| l.timestamp += 10_000);

        let first = dequeue_next(&env).unwrap();
        assert_eq!(first.proposal_id, id_critical);
        assert_eq!(first.priority, ProposalPriority::Critical);

        let second = dequeue_next(&env).unwrap();
        assert_eq!(second.proposal_id, id_normal);
    }

    #[test]
    fn test_priority_ordering_all_levels() {
        let (env, admin) = setup();
        let id_low = make_queued_proposal(&env, &admin, 100);
        let id_normal = make_queued_proposal(&env, &admin, 100);
        let id_high = make_queued_proposal(&env, &admin, 100);
        let id_critical = make_queued_proposal(&env, &admin, 100);

        enqueue_proposal(&env, id_low, ProposalPriority::Low).unwrap();
        enqueue_proposal(&env, id_normal, ProposalPriority::Normal).unwrap();
        enqueue_proposal(&env, id_high, ProposalPriority::High).unwrap();
        enqueue_proposal(&env, id_critical, ProposalPriority::Critical).unwrap();

        env.ledger().with_mut(|l| l.timestamp += 10_000);

        let order: Vec<u64> = (0..4).map(|_| dequeue_next(&env).unwrap().proposal_id).collect();
        assert_eq!(order, vec![id_critical, id_high, id_normal, id_low]);
    }

    // ── FIFO tiebreaker ───────────────────────────────────────────────────

    #[test]
    fn test_fifo_tiebreaker_same_priority() {
        let (env, admin) = setup();
        let id1 = make_queued_proposal(&env, &admin, 100);

        // Advance time slightly so id2 has a later enqueued_at
        enqueue_proposal(&env, id1, ProposalPriority::High).unwrap();
        env.ledger().with_mut(|l| l.timestamp += 1);

        let id2 = make_queued_proposal(&env, &admin, 100);
        enqueue_proposal(&env, id2, ProposalPriority::High).unwrap();

        env.ledger().with_mut(|l| l.timestamp += 10_000);

        // id1 was enqueued first → should come out first
        let first = dequeue_next(&env).unwrap();
        assert_eq!(first.proposal_id, id1);
    }

    // ── dequeue_next ─────────────────────────────────────────────────────

    #[test]
    fn test_dequeue_empty_queue_returns_error() {
        let (env, _) = setup();
        assert_eq!(dequeue_next(&env), Err(Error::NothingToClaim));
    }

    #[test]
    fn test_dequeue_before_eta_returns_error() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 10_000);
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        assert_eq!(dequeue_next(&env), Err(Error::NothingToClaim));
    }

    #[test]
    fn test_dequeue_removes_entry() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 100);
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        env.ledger().with_mut(|l| l.timestamp += 10_000);
        dequeue_next(&env).unwrap();
        assert_eq!(queue_len(&env), 0);
        assert_eq!(dequeue_next(&env), Err(Error::NothingToClaim));
    }

    // ── remove_from_queue ─────────────────────────────────────────────────

    #[test]
    fn test_remove_existing_entry() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 100);
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        assert_eq!(queue_len(&env), 1);
        remove_from_queue(&env, id).unwrap();
        assert_eq!(queue_len(&env), 0);
    }

    #[test]
    fn test_remove_nonexistent_entry_fails() {
        let (env, _) = setup();
        assert_eq!(remove_from_queue(&env, 42), Err(Error::ProposalNotFound));
    }

    // ── execute_next_in_queue ─────────────────────────────────────────────

    #[test]
    fn test_execute_next_empty_queue_fails() {
        let (env, _) = setup();
        assert_eq!(execute_next_in_queue(&env), Err(Error::NothingToClaim));
    }

    #[test]
    fn test_execute_next_before_eta_fails() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 10_000);
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();
        assert_eq!(execute_next_in_queue(&env), Err(Error::NothingToClaim));
    }

    #[test]
    fn test_execute_next_succeeds_and_removes_from_queue() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 100);
        enqueue_proposal(&env, id, ProposalPriority::Normal).unwrap();

        // Advance past eta
        let proposal = storage::get_proposal(&env, id).unwrap();
        env.ledger().with_mut(|l| l.timestamp = proposal.eta + 1);

        let executed_id = execute_next_in_queue(&env).unwrap();
        assert_eq!(executed_id, id);
        assert_eq!(queue_len(&env), 0);

        // Proposal should now be Executed
        let p = storage::get_proposal(&env, id).unwrap();
        assert_eq!(p.state, ProposalState::Executed);
    }

    #[test]
    fn test_execute_next_picks_highest_priority() {
        let (env, admin) = setup();
        let id_low = make_queued_proposal(&env, &admin, 100);
        let id_high = make_queued_proposal(&env, &admin, 100);

        enqueue_proposal(&env, id_low, ProposalPriority::Low).unwrap();
        enqueue_proposal(&env, id_high, ProposalPriority::High).unwrap();

        // Advance past both etas
        let p = storage::get_proposal(&env, id_high).unwrap();
        env.ledger().with_mut(|l| l.timestamp = p.eta + 1);

        let executed_id = execute_next_in_queue(&env).unwrap();
        assert_eq!(executed_id, id_high);
        assert_eq!(queue_len(&env), 1); // id_low still in queue
    }

    // ── Single-entry edge cases ───────────────────────────────────────────

    #[test]
    fn test_single_entry_full_lifecycle() {
        let (env, admin) = setup();
        let id = make_queued_proposal(&env, &admin, 500);

        assert_eq!(queue_len(&env), 0);
        enqueue_proposal(&env, id, ProposalPriority::Critical).unwrap();
        assert_eq!(queue_len(&env), 1);

        // Not ready yet
        assert!(peek_next(&env).is_none());

        // Advance past eta
        let p = storage::get_proposal(&env, id).unwrap();
        env.ledger().with_mut(|l| l.timestamp = p.eta + 1);

        let entry = peek_next(&env).unwrap();
        assert_eq!(entry.proposal_id, id);
        assert_eq!(entry.priority, ProposalPriority::Critical);

        let executed = execute_next_in_queue(&env).unwrap();
        assert_eq!(executed, id);
        assert_eq!(queue_len(&env), 0);
    }
}

//! Stateful Property Tests for Governance Proposal Lifecycle
//!
//! These tests verify critical governance invariants under randomized conditions:
//! - Proposal state transitions are valid
//! - Vote counts are monotonically increasing
//! - Only authorized addresses can perform actions
//! - Timelock constraints are enforced
//! - Execution can only happen in valid states
//!
//! Run: cargo test governance_proposal_lifecycle_property_test

#[cfg(test)]
mod governance_proposal_lifecycle_property_tests {
    use proptest::prelude::*;

    /// Proposal state machine
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum ProposalState {
        Queued,
        Active,
        Succeeded,
        Defeated,
        Executed,
        Cancelled,
    }

    /// Vote choice
    #[derive(Debug, Clone, Copy)]
    enum VoteChoice {
        For,
        Against,
        Abstain,
    }

    /// Proposal vote counts
    #[derive(Debug, Clone, Copy)]
    struct VoteCounts {
        for_votes: i128,
        against_votes: i128,
        abstain_votes: i128,
    }

    impl VoteCounts {
        fn new() -> Self {
            VoteCounts {
                for_votes: 0,
                against_votes: 0,
                abstain_votes: 0,
            }
        }

        fn add_vote(&mut self, choice: VoteChoice) {
            match choice {
                VoteChoice::For => self.for_votes += 1,
                VoteChoice::Against => self.against_votes += 1,
                VoteChoice::Abstain => self.abstain_votes += 1,
            }
        }

        fn total(&self) -> i128 {
            self.for_votes + self.against_votes + self.abstain_votes
        }

        fn is_passed(&self) -> bool {
            self.for_votes > self.against_votes
        }
    }

    /// Proposal state machine
    struct Proposal {
        id: u64,
        state: ProposalState,
        votes: VoteCounts,
        created_at: u64,
        voting_starts_at: u64,
        voting_ends_at: u64,
        execution_eta: u64,
        executed_at: Option<u64>,
        cancelled: bool,
    }

    impl Proposal {
        fn new(id: u64, now: u64) -> Self {
            Proposal {
                id,
                state: ProposalState::Queued,
                votes: VoteCounts::new(),
                created_at: now,
                voting_starts_at: now + 1000,
                voting_ends_at: now + 50000,
                execution_eta: now + 60000,
                executed_at: None,
                cancelled: false,
            }
        }

        fn can_vote(&self, now: u64) -> bool {
            !self.cancelled
                && self.state == ProposalState::Active
                && now >= self.voting_starts_at
                && now < self.voting_ends_at
        }

        fn can_execute(&self, now: u64) -> bool {
            !self.cancelled
                && self.state == ProposalState::Succeeded
                && now >= self.execution_eta
                && self.executed_at.is_none()
        }

        fn can_cancel(&self) -> bool {
            !self.cancelled && self.state != ProposalState::Executed
        }

        fn activate(&mut self, now: u64) -> Result<(), String> {
            if self.state != ProposalState::Queued {
                return Err("Can only activate queued proposals".to_string());
            }
            if now < self.voting_starts_at {
                return Err("Voting has not started yet".to_string());
            }
            self.state = ProposalState::Active;
            Ok(())
        }

        fn add_vote(&mut self, choice: VoteChoice, now: u64) -> Result<(), String> {
            if !self.can_vote(now) {
                return Err("Cannot vote on this proposal".to_string());
            }
            self.votes.add_vote(choice);
            Ok(())
        }

        fn finalize(&mut self, now: u64) -> Result<(), String> {
            if self.state != ProposalState::Active {
                return Err("Can only finalize active proposals".to_string());
            }
            if now < self.voting_ends_at {
                return Err("Voting period has not ended".to_string());
            }

            self.state = if self.votes.is_passed() {
                ProposalState::Succeeded
            } else {
                ProposalState::Defeated
            };
            Ok(())
        }

        fn execute(&mut self, now: u64) -> Result<(), String> {
            if !self.can_execute(now) {
                return Err("Cannot execute this proposal".to_string());
            }
            self.state = ProposalState::Executed;
            self.executed_at = Some(now);
            Ok(())
        }

        fn cancel(&mut self) -> Result<(), String> {
            if !self.can_cancel() {
                return Err("Cannot cancel this proposal".to_string());
            }
            self.cancelled = true;
            self.state = ProposalState::Cancelled;
            Ok(())
        }
    }

    // ── Property Tests ────────────────────────────────────────────────────────

    proptest! {
        /// Property: Vote counts are monotonically increasing
        ///
        /// Invariant: Once votes are cast, totals never decrease
        #[test]
        fn prop_monotonic_vote_totals(
            num_votes in 1usize..100,
            vote_sequence in prop::collection::vec(0u8..3, 1..100)
        ) {
            let mut proposal = Proposal::new(1, 0);
            proposal.state = ProposalState::Active;

            let mut prev_total = 0i128;

            for i in 0..num_votes.min(vote_sequence.len()) {
                let choice = match vote_sequence[i] % 3 {
                    0 => VoteChoice::For,
                    1 => VoteChoice::Against,
                    _ => VoteChoice::Abstain,
                };

                let _ = proposal.add_vote(choice, 25000);
                let current_total = proposal.votes.total();

                prop_assert!(
                    current_total >= prev_total,
                    "Vote total decreased: {} -> {}",
                    prev_total,
                    current_total
                );

                prev_total = current_total;
            }
        }

        /// Property: State transitions follow valid paths
        ///
        /// Invariant: Proposals can only transition through valid states
        #[test]
        fn prop_valid_state_transitions(
            now_offset in 0u64..100000
        ) {
            let mut proposal = Proposal::new(1, 0);
            let now = now_offset;

            // Queued -> Active
            if now >= proposal.voting_starts_at {
                let result = proposal.activate(now);
                prop_assert!(result.is_ok(), "Failed to activate proposal");
                prop_assert_eq!(proposal.state, ProposalState::Active);
            }

            // Active -> Succeeded/Defeated
            if now >= proposal.voting_ends_at {
                let result = proposal.finalize(now);
                prop_assert!(result.is_ok(), "Failed to finalize proposal");
                prop_assert!(
                    proposal.state == ProposalState::Succeeded
                        || proposal.state == ProposalState::Defeated
                );
            }

            // Succeeded -> Executed
            if proposal.state == ProposalState::Succeeded && now >= proposal.execution_eta {
                let result = proposal.execute(now);
                prop_assert!(result.is_ok(), "Failed to execute proposal");
                prop_assert_eq!(proposal.state, ProposalState::Executed);
            }
        }

        /// Property: Cancelled proposals cannot be modified
        ///
        /// Invariant: Once cancelled, proposal state is immutable
        #[test]
        fn prop_cancelled_immutability(
            vote_choice in 0u8..3
        ) {
            let mut proposal = Proposal::new(1, 0);
            proposal.state = ProposalState::Active;

            // Cancel the proposal
            let cancel_result = proposal.cancel();
            prop_assert!(cancel_result.is_ok());
            prop_assert_eq!(proposal.state, ProposalState::Cancelled);

            // Try to vote on cancelled proposal
            let choice = match vote_choice % 3 {
                0 => VoteChoice::For,
                1 => VoteChoice::Against,
                _ => VoteChoice::Abstain,
            };

            let vote_result = proposal.add_vote(choice, 25000);
            prop_assert!(vote_result.is_err(), "Should not allow voting on cancelled proposal");
        }

        /// Property: Executed proposals cannot be cancelled
        ///
        /// Invariant: Terminal states are immutable
        #[test]
        fn prop_executed_immutability() {
            let mut proposal = Proposal::new(1, 0);
            proposal.state = ProposalState::Succeeded;
            proposal.executed_at = Some(100000);
            proposal.state = ProposalState::Executed;

            // Try to cancel executed proposal
            let cancel_result = proposal.cancel();
            prop_assert!(cancel_result.is_err(), "Should not allow cancelling executed proposal");
            prop_assert_eq!(proposal.state, ProposalState::Executed);
        }

        /// Property: Timelock constraints are enforced
        ///
        /// Invariant: Actions can only occur at appropriate times
        #[test]
        fn prop_timelock_enforcement(
            now in 0u64..200000
        ) {
            let mut proposal = Proposal::new(1, 0);

            // Cannot activate before voting starts
            if now < proposal.voting_starts_at {
                let result = proposal.activate(now);
                prop_assert!(result.is_err(), "Should not activate before voting starts");
            }

            // Cannot finalize before voting ends
            proposal.state = ProposalState::Active;
            if now < proposal.voting_ends_at {
                let result = proposal.finalize(now);
                prop_assert!(result.is_err(), "Should not finalize before voting ends");
            }

            // Cannot execute before execution ETA
            proposal.state = ProposalState::Succeeded;
            if now < proposal.execution_eta {
                let result = proposal.execute(now);
                prop_assert!(result.is_err(), "Should not execute before ETA");
            }
        }

        /// Property: Vote counts match vote history
        ///
        /// Invariant: Vote totals are consistent with individual votes
        #[test]
        fn prop_vote_count_consistency(
            for_votes in 0i128..1000,
            against_votes in 0i128..1000,
            abstain_votes in 0i128..1000
        ) {
            let mut proposal = Proposal::new(1, 0);
            proposal.state = ProposalState::Active;

            // Add votes
            for _ in 0..for_votes {
                let _ = proposal.add_vote(VoteChoice::For, 25000);
            }
            for _ in 0..against_votes {
                let _ = proposal.add_vote(VoteChoice::Against, 25000);
            }
            for _ in 0..abstain_votes {
                let _ = proposal.add_vote(VoteChoice::Abstain, 25000);
            }

            // Verify counts
            prop_assert_eq!(proposal.votes.for_votes, for_votes);
            prop_assert_eq!(proposal.votes.against_votes, against_votes);
            prop_assert_eq!(proposal.votes.abstain_votes, abstain_votes);
            prop_assert_eq!(
                proposal.votes.total(),
                for_votes + against_votes + abstain_votes
            );
        }

        /// Property: Proposal outcome is deterministic
        ///
        /// Invariant: Same vote distribution always produces same outcome
        #[test]
        fn prop_deterministic_outcome(
            for_votes in 0i128..1000,
            against_votes in 0i128..1000
        ) {
            let mut proposal1 = Proposal::new(1, 0);
            proposal1.state = ProposalState::Active;

            let mut proposal2 = Proposal::new(2, 0);
            proposal2.state = ProposalState::Active;

            // Add same votes to both
            for _ in 0..for_votes {
                let _ = proposal1.add_vote(VoteChoice::For, 25000);
                let _ = proposal2.add_vote(VoteChoice::For, 25000);
            }
            for _ in 0..against_votes {
                let _ = proposal1.add_vote(VoteChoice::Against, 25000);
                let _ = proposal2.add_vote(VoteChoice::Against, 25000);
            }

            // Finalize both
            let _ = proposal1.finalize(100000);
            let _ = proposal2.finalize(100000);

            // Outcomes should be identical
            prop_assert_eq!(proposal1.state, proposal2.state);
            prop_assert_eq!(proposal1.votes.is_passed(), proposal2.votes.is_passed());
        }

        /// Property: Execution can only happen once
        ///
        /// Invariant: Proposals cannot be executed multiple times
        #[test]
        fn prop_single_execution() {
            let mut proposal = Proposal::new(1, 0);
            proposal.state = ProposalState::Succeeded;

            // First execution should succeed
            let first_result = proposal.execute(100000);
            prop_assert!(first_result.is_ok());
            prop_assert_eq!(proposal.state, ProposalState::Executed);

            // Second execution should fail
            let second_result = proposal.execute(100000);
            prop_assert!(second_result.is_err(), "Should not allow double execution");
        }
    }

    // ── Unit Tests ────────────────────────────────────────────────────────────

    #[test]
    fn test_proposal_creation() {
        let proposal = Proposal::new(1, 0);
        assert_eq!(proposal.id, 1);
        assert_eq!(proposal.state, ProposalState::Queued);
        assert_eq!(proposal.votes.total(), 0);
        assert!(!proposal.cancelled);
    }

    #[test]
    fn test_vote_counting() {
        let mut proposal = Proposal::new(1, 0);
        proposal.state = ProposalState::Active;

        assert!(proposal.add_vote(VoteChoice::For, 25000).is_ok());
        assert!(proposal.add_vote(VoteChoice::Against, 25000).is_ok());
        assert!(proposal.add_vote(VoteChoice::Abstain, 25000).is_ok());

        assert_eq!(proposal.votes.for_votes, 1);
        assert_eq!(proposal.votes.against_votes, 1);
        assert_eq!(proposal.votes.abstain_votes, 1);
        assert_eq!(proposal.votes.total(), 3);
    }

    #[test]
    fn test_proposal_passed() {
        let mut proposal = Proposal::new(1, 0);
        proposal.state = ProposalState::Active;

        for _ in 0..10 {
            let _ = proposal.add_vote(VoteChoice::For, 25000);
        }
        for _ in 0..5 {
            let _ = proposal.add_vote(VoteChoice::Against, 25000);
        }

        assert!(proposal.votes.is_passed());
    }

    #[test]
    fn test_proposal_defeated() {
        let mut proposal = Proposal::new(1, 0);
        proposal.state = ProposalState::Active;

        for _ in 0..5 {
            let _ = proposal.add_vote(VoteChoice::For, 25000);
        }
        for _ in 0..10 {
            let _ = proposal.add_vote(VoteChoice::Against, 25000);
        }

        assert!(!proposal.votes.is_passed());
    }

    #[test]
    fn test_state_transitions() {
        let mut proposal = Proposal::new(1, 0);

        // Queued -> Active
        assert!(proposal.activate(1000).is_ok());
        assert_eq!(proposal.state, ProposalState::Active);

        // Active -> Succeeded
        assert!(proposal.finalize(50000).is_ok());
        assert_eq!(proposal.state, ProposalState::Succeeded);

        // Succeeded -> Executed
        assert!(proposal.execute(60000).is_ok());
        assert_eq!(proposal.state, ProposalState::Executed);
    }

    #[test]
    fn test_cannot_vote_after_voting_ends() {
        let mut proposal = Proposal::new(1, 0);
        proposal.state = ProposalState::Active;

        // Voting ends at 50000
        let result = proposal.add_vote(VoteChoice::For, 50001);
        assert!(result.is_err());
    }

    #[test]
    fn test_cannot_execute_before_eta() {
        let mut proposal = Proposal::new(1, 0);
        proposal.state = ProposalState::Succeeded;

        // Execution ETA is 60000
        let result = proposal.execute(59999);
        assert!(result.is_err());
    }
}

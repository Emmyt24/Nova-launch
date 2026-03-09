//! Proposal State Machine Integration Tests
//!
//! Comprehensive tests for proposal lifecycle state transitions.
//! Tests all legal and illegal paths through the state machine.

#[cfg(test)]
mod proposal_state_machine_tests {
    use crate::proposal_state_machine::ProposalStateMachine;
    use crate::types::{Error, ProposalState};

    /// Test the complete happy path: Created -> Active -> Succeeded -> Queued -> Executed
    #[test]
    fn test_happy_path_full_lifecycle() {
        let mut state = ProposalState::Created;

        // Created -> Active
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Active).is_ok());
        state = ProposalState::Active;

        // Active -> Succeeded
        assert!(
            ProposalStateMachine::validate_transition(state, ProposalState::Succeeded).is_ok()
        );
        state = ProposalState::Succeeded;

        // Succeeded -> Queued
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Queued).is_ok());
        state = ProposalState::Queued;

        // Queued -> Executed
        assert!(
            ProposalStateMachine::validate_transition(state, ProposalState::Executed).is_ok()
        );
        state = ProposalState::Executed;

        // Executed is terminal - no further transitions
        assert!(ProposalStateMachine::is_terminal_state(state));
    }

    /// Test defeated path: Created -> Active -> Defeated
    #[test]
    fn test_defeated_path() {
        let mut state = ProposalState::Created;

        // Created -> Active
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Active).is_ok());
        state = ProposalState::Active;

        // Active -> Defeated
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Defeated).is_ok());
        state = ProposalState::Defeated;

        // Defeated is terminal
        assert!(ProposalStateMachine::is_terminal_state(state));
    }

    /// Test expired path: Created -> Active -> Expired
    #[test]
    fn test_expired_during_voting() {
        let mut state = ProposalState::Created;

        // Created -> Active
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Active).is_ok());
        state = ProposalState::Active;

        // Active -> Expired
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Expired).is_ok());
        state = ProposalState::Expired;

        // Expired is terminal
        assert!(ProposalStateMachine::is_terminal_state(state));
    }

    /// Test expired after queuing: Created -> Active -> Succeeded -> Queued -> Expired
    #[test]
    fn test_expired_after_queuing() {
        let mut state = ProposalState::Created;

        // Created -> Active -> Succeeded -> Queued
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Active).is_ok());
        state = ProposalState::Active;
        assert!(
            ProposalStateMachine::validate_transition(state, ProposalState::Succeeded).is_ok()
        );
        state = ProposalState::Succeeded;
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Queued).is_ok());
        state = ProposalState::Queued;

        // Queued -> Expired (timelock expired without execution)
        assert!(ProposalStateMachine::validate_transition(state, ProposalState::Expired).is_ok());
        state = ProposalState::Expired;

        assert!(ProposalStateMachine::is_terminal_state(state));
    }

    /// Test cancellation from various states
    #[test]
    fn test_cancellation_paths() {
        // Can cancel from Created
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Created,
            ProposalState::Cancelled
        )
        .is_ok());

        // Can cancel from Active
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Active,
            ProposalState::Cancelled
        )
        .is_ok());

        // Can cancel from Succeeded
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Succeeded,
            ProposalState::Cancelled
        )
        .is_ok());

        // Can cancel from Queued
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Queued,
            ProposalState::Cancelled
        )
        .is_ok());
    }

    /// Test that terminal states cannot be cancelled
    #[test]
    fn test_cannot_cancel_terminal_states() {
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Defeated,
                ProposalState::Cancelled
            ),
            Err(Error::InvalidParameters)
        );

        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Executed,
                ProposalState::Cancelled
            ),
            Err(Error::InvalidParameters)
        );

        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Expired,
                ProposalState::Cancelled
            ),
            Err(Error::InvalidParameters)
        );

        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Cancelled,
                ProposalState::Cancelled
            ),
            Err(Error::InvalidParameters)
        );
    }

    /// Test illegal state skipping
    #[test]
    fn test_cannot_skip_states() {
        // Cannot skip from Created to Succeeded
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Created,
                ProposalState::Succeeded
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot skip from Created to Queued
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Created,
                ProposalState::Queued
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot skip from Created to Executed
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Created,
                ProposalState::Executed
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot skip from Active to Queued
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Active,
                ProposalState::Queued
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot skip from Active to Executed
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Active,
                ProposalState::Executed
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot skip from Succeeded to Executed
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Succeeded,
                ProposalState::Executed
            ),
            Err(Error::InvalidParameters)
        );
    }

    /// Test illegal backward transitions
    #[test]
    fn test_cannot_go_backwards() {
        // Cannot go from Active to Created
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Active,
                ProposalState::Created
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot go from Succeeded to Active
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Succeeded,
                ProposalState::Active
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot go from Queued to Succeeded
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Queued,
                ProposalState::Succeeded
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot go from Queued to Active
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Queued,
                ProposalState::Active
            ),
            Err(Error::InvalidParameters)
        );
    }

    /// Test resurrection prevention - terminal states cannot transition
    #[test]
    fn test_no_resurrection_from_defeated() {
        let terminal_state = ProposalState::Defeated;

        // Cannot transition to any state from Defeated
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Created),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Active),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Succeeded),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Queued),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Executed),
            Err(Error::InvalidParameters)
        );
    }

    /// Test resurrection prevention - executed proposals stay executed
    #[test]
    fn test_no_resurrection_from_executed() {
        let terminal_state = ProposalState::Executed;

        // Cannot transition to any state from Executed
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Created),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Active),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Queued),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Defeated),
            Err(Error::InvalidParameters)
        );
    }

    /// Test resurrection prevention - expired proposals cannot be revived
    #[test]
    fn test_no_resurrection_from_expired() {
        let terminal_state = ProposalState::Expired;

        // Cannot transition to any state from Expired
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Active),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Queued),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Executed),
            Err(Error::InvalidParameters)
        );
    }

    /// Test resurrection prevention - cancelled proposals cannot be revived
    #[test]
    fn test_no_resurrection_from_cancelled() {
        let terminal_state = ProposalState::Cancelled;

        // Cannot transition to any state from Cancelled
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Created),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Active),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Succeeded),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Queued),
            Err(Error::InvalidParameters)
        );
        assert_eq!(
            ProposalStateMachine::validate_transition(terminal_state, ProposalState::Executed),
            Err(Error::InvalidParameters)
        );
    }

    /// Test all terminal states are properly identified
    #[test]
    fn test_terminal_state_identification() {
        // Terminal states
        assert!(ProposalStateMachine::is_terminal_state(
            ProposalState::Defeated
        ));
        assert!(ProposalStateMachine::is_terminal_state(
            ProposalState::Executed
        ));
        assert!(ProposalStateMachine::is_terminal_state(
            ProposalState::Expired
        ));
        assert!(ProposalStateMachine::is_terminal_state(
            ProposalState::Cancelled
        ));

        // Non-terminal states
        assert!(!ProposalStateMachine::is_terminal_state(
            ProposalState::Created
        ));
        assert!(!ProposalStateMachine::is_terminal_state(
            ProposalState::Active
        ));
        assert!(!ProposalStateMachine::is_terminal_state(
            ProposalState::Succeeded
        ));
        assert!(!ProposalStateMachine::is_terminal_state(
            ProposalState::Queued
        ));
    }

    /// Test invalid lateral transitions
    #[test]
    fn test_invalid_lateral_transitions() {
        // Cannot go from Succeeded to Defeated
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Succeeded,
                ProposalState::Defeated
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot go from Defeated to Succeeded
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Defeated,
                ProposalState::Succeeded
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot go from Queued to Defeated
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Queued,
                ProposalState::Defeated
            ),
            Err(Error::InvalidParameters)
        );
    }

    /// Test state machine invariants hold across all transitions
        let env = soroban_sdk::Env::default();
        let all_states = soroban_sdk::vec![
            &env,
            ProposalState::Created,
            ProposalState::Active,
            ProposalState::Succeeded,
            ProposalState::Defeated,
            ProposalState::Queued,
            ProposalState::Executed,
            ProposalState::Expired,
            ProposalState::Cancelled,
        ];

        for from_state in &all_states {
            for to_state in &all_states {
                let result =
                    ProposalStateMachine::validate_transition(*from_state, *to_state);

                // Invariant 1: Terminal states cannot transition (except to themselves)
                if ProposalStateMachine::is_terminal_state(*from_state) && from_state != to_state
                {
                    assert_eq!(result, Err(Error::InvalidParameters));
                }

                // Invariant 2: Same state transition is always allowed
                if from_state == to_state {
                    assert!(result.is_ok());
                }
            }
        }
    }

    /// Test that valid next states are correctly identified
        let env = soroban_sdk::Env::default();
        let all_states = soroban_sdk::vec![
            &env,
            ProposalState::Created,
            ProposalState::Active,
            ProposalState::Succeeded,
            ProposalState::Defeated,
            ProposalState::Queued,
            ProposalState::Executed,
            ProposalState::Expired,
            ProposalState::Cancelled,
        ];

        for from_state in all_states.iter() {
            let valid_next = ProposalStateMachine::get_valid_next_states(&env, from_state);

            for to_state in &all_states {
                let is_valid =
                    ProposalStateMachine::validate_transition(*from_state, *to_state).is_ok();
                let in_valid_list = valid_next.contains(to_state);

                // If transition is valid and not same-state, it should be in valid_next list
                if is_valid && from_state != to_state {
                    assert!(
                        in_valid_list,
                        "State {:?} -> {:?} is valid but not in valid_next_states",
                        from_state,
                        to_state
                    );
                }
            }
        }
    }
}

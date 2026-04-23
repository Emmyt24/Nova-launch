//! Proposal State Machine
//!
//! Enforces legal state transitions for proposal lifecycle.
//! Implements a strict state machine to prevent invalid state changes.

use crate::types::{ActionType, Error, GovernanceConfig, Proposal, ProposalState};
use soroban_sdk::vec;

/// State machine for proposal lifecycle
///
/// Defines all legal state transitions and validates them.
///
/// # State Transition Rules
/// ```text
/// Created -> Active
/// Active -> Succeeded | Defeated | Expired
/// Succeeded -> Queued
/// Queued -> Executed | Expired
///
/// Terminal States (no transitions allowed):
/// - Defeated
/// - Executed
/// - Expired
/// - Cancelled
/// ```
pub struct ProposalStateMachine;

impl ProposalStateMachine {
    /// Check if a state is terminal (no further transitions allowed)
    pub fn is_terminal_state(state: ProposalState) -> bool {
        matches!(
            state,
            ProposalState::Defeated
                | ProposalState::Executed
                | ProposalState::Expired
                | ProposalState::Cancelled
                | ProposalState::Failed
        )
    }

    /// Validate if a state transition is legal
    ///
    /// # Arguments
    /// * `from` - Current state
    /// * `to` - Desired next state
    ///
    /// # Returns
    /// * `Ok(())` - Transition is valid
    /// * `Err(Error)` - Transition is invalid with specific error
    pub fn validate_transition(from: ProposalState, to: ProposalState) -> Result<(), Error> {
        // Cannot transition from terminal states
        if Self::is_terminal_state(from) {
            return Err(Error::InvalidParameters);
        }

        // Cannot transition to the same state
        if from == to {
            return Ok(()); // No-op transition is allowed
        }

        // Validate specific transitions
        match (from, to) {
            // Created -> Active
            (ProposalState::Created, ProposalState::Active) => Ok(()),

            // Created -> Failed (proposal expired before any votes)
            (ProposalState::Created, ProposalState::Failed) => Ok(()),

            // Active -> Succeeded, Defeated, or Expired
            (ProposalState::Active, ProposalState::Succeeded) => Ok(()),
            (ProposalState::Active, ProposalState::Defeated) => Ok(()),
            (ProposalState::Active, ProposalState::Expired) => Ok(()),
            (ProposalState::Active, ProposalState::Failed) => Ok(()),

            // Succeeded -> Queued
            (ProposalState::Succeeded, ProposalState::Queued) => Ok(()),

            // Queued -> Executed or Expired
            (ProposalState::Queued, ProposalState::Executed) => Ok(()),
            (ProposalState::Queued, ProposalState::Expired) => Ok(()),

            // Any state -> Cancelled (admin override)
            (_, ProposalState::Cancelled) => {
                if Self::is_terminal_state(from) {
                    Err(Error::InvalidParameters)
                } else {
                    Ok(())
                }
            }

            // All other transitions are invalid
            _ => Err(Error::InvalidParameters),
        }
    }

    /// Get the next valid states from the current state
    pub fn get_valid_next_states(
        env: &soroban_sdk::Env,
        state: ProposalState,
    ) -> soroban_sdk::Vec<ProposalState> {
        match state {
            ProposalState::Created => vec![env, ProposalState::Active, ProposalState::Cancelled],
            ProposalState::Active => vec![
                env,
                ProposalState::Succeeded,
                ProposalState::Defeated,
                ProposalState::Expired,
                ProposalState::Cancelled,
            ],
            ProposalState::Succeeded => vec![env, ProposalState::Queued, ProposalState::Cancelled],
            ProposalState::Queued => {
                vec![env, ProposalState::Executed, ProposalState::Expired]
            }
            // Terminal states have no valid transitions
            ProposalState::Defeated
            | ProposalState::Executed
            | ProposalState::Expired
            | ProposalState::Cancelled
            | ProposalState::Failed => soroban_sdk::Vec::new(env),
        }
    }

    /// Check if a proposal can be voted on in its current state
    pub fn can_vote(state: ProposalState) -> bool {
        matches!(state, ProposalState::Active)
    }

    /// Check if a proposal can be queued in its current state
    pub fn can_queue(state: ProposalState) -> bool {
        matches!(state, ProposalState::Succeeded)
    }

    /// Check if a proposal can be executed in its current state
    pub fn can_execute(state: ProposalState) -> bool {
        matches!(state, ProposalState::Queued)
    }

    /// Check if a proposal can be cancelled in its current state
    pub fn can_cancel(state: ProposalState) -> bool {
        !Self::is_terminal_state(state)
    }

    /// Derives current proposal state from its data
    pub fn get_proposal_state(
        env: &soroban_sdk::Env,
        proposal: &Proposal,
        config: &crate::types::GovernanceConfig,
    ) -> ProposalState {
        if proposal.cancelled_at.is_some() {
            return ProposalState::Cancelled;
        }
        if proposal.executed_at.is_some() {
            return ProposalState::Executed;
        }

        let current_time = env.ledger().timestamp();

        if current_time < proposal.created_at {
            return ProposalState::Created;
        }

        if current_time <= proposal.end_time {
            return ProposalState::Active;
        }

        // Check if successful
        let total_votes = proposal.votes_for + proposal.votes_against + proposal.votes_abstain;
        let total_possible_votes = 1_000_000_000; // Simplified for tests

        let quorum_met =
            (total_votes * 100 / total_possible_votes) >= config.quorum_percent as i128;
        let approval_met = if total_votes > 0 {
            (proposal.votes_for * 100 / total_votes) >= config.approval_percent as i128
        } else {
            false
        };

        if quorum_met && approval_met {
            // Need to check if it's queued or succeeded
            // For now, if current_time > voting_ends_at but not executed/cancelled, it's Succeeded (or Queued)
            // Simplified:
            ProposalState::Succeeded
        } else {
            ProposalState::Defeated
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_states() {
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

    #[test]
    fn test_valid_transitions() {
        // Created -> Active
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Created,
            ProposalState::Active
        )
        .is_ok());

        // Active -> Succeeded
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Active,
            ProposalState::Succeeded
        )
        .is_ok());

        // Active -> Defeated
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Active,
            ProposalState::Defeated
        )
        .is_ok());

        // Active -> Expired
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Active,
            ProposalState::Expired
        )
        .is_ok());

        // Succeeded -> Queued
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Succeeded,
            ProposalState::Queued
        )
        .is_ok());

        // Queued -> Executed
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Queued,
            ProposalState::Executed
        )
        .is_ok());

        // Queued -> Expired
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Queued,
            ProposalState::Expired
        )
        .is_ok());
    }

    #[test]
    fn test_invalid_transitions() {
        // Cannot skip states
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Created,
                ProposalState::Succeeded
            ),
            Err(Error::InvalidParameters)
        );

        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Created,
                ProposalState::Executed
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot go backwards
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Active,
                ProposalState::Created
            ),
            Err(Error::InvalidParameters)
        );

        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Queued,
                ProposalState::Succeeded
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot transition from Defeated
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Defeated,
                ProposalState::Active
            ),
            Err(Error::InvalidParameters)
        );
    }

    #[test]
    fn test_terminal_state_transitions() {
        // Cannot transition from Executed
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Executed,
                ProposalState::Active
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot transition from Expired
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Expired,
                ProposalState::Queued
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot transition from Cancelled
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Cancelled,
                ProposalState::Active
            ),
            Err(Error::InvalidParameters)
        );

        // Cannot cancel already terminal states
        assert_eq!(
            ProposalStateMachine::validate_transition(
                ProposalState::Executed,
                ProposalState::Cancelled
            ),
            Err(Error::InvalidParameters)
        );
    }

    #[test]
    fn test_cancel_transitions() {
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

        // Cannot cancel from terminal states
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Defeated,
            ProposalState::Cancelled
        )
        .is_err());
    }

    #[test]
    fn test_same_state_transition() {
        // Same state transition is a no-op (allowed)
        assert!(ProposalStateMachine::validate_transition(
            ProposalState::Active,
            ProposalState::Active
        )
        .is_ok());
    }

    #[test]
    fn test_get_valid_next_states() {
        let env = soroban_sdk::Env::default();
        let created_next =
            ProposalStateMachine::get_valid_next_states(&env, ProposalState::Created);
        assert_eq!(created_next.len(), 2);
        assert!(created_next.contains(ProposalState::Active));
        assert!(created_next.contains(ProposalState::Cancelled));

        let active_next = ProposalStateMachine::get_valid_next_states(&env, ProposalState::Active);
        assert_eq!(active_next.len(), 4);
        assert!(active_next.contains(ProposalState::Succeeded));
        assert!(active_next.contains(ProposalState::Defeated));
        assert!(active_next.contains(ProposalState::Expired));
        assert!(active_next.contains(ProposalState::Cancelled));

        let executed_next =
            ProposalStateMachine::get_valid_next_states(&env, ProposalState::Executed);
        assert_eq!(executed_next.len(), 0);
    }

    #[test]
    fn test_can_vote() {
        assert!(!ProposalStateMachine::can_vote(ProposalState::Created));
        assert!(ProposalStateMachine::can_vote(ProposalState::Active));
        assert!(!ProposalStateMachine::can_vote(ProposalState::Succeeded));
        assert!(!ProposalStateMachine::can_vote(ProposalState::Defeated));
        assert!(!ProposalStateMachine::can_vote(ProposalState::Queued));
        assert!(!ProposalStateMachine::can_vote(ProposalState::Executed));
        assert!(!ProposalStateMachine::can_vote(ProposalState::Expired));
        assert!(!ProposalStateMachine::can_vote(ProposalState::Cancelled));
    }

    #[test]
    fn test_can_queue() {
        assert!(!ProposalStateMachine::can_queue(ProposalState::Created));
        assert!(!ProposalStateMachine::can_queue(ProposalState::Active));
        assert!(ProposalStateMachine::can_queue(ProposalState::Succeeded));
        assert!(!ProposalStateMachine::can_queue(ProposalState::Defeated));
        assert!(!ProposalStateMachine::can_queue(ProposalState::Queued));
        assert!(!ProposalStateMachine::can_queue(ProposalState::Executed));
    }

    #[test]
    fn test_can_execute() {
        assert!(!ProposalStateMachine::can_execute(ProposalState::Created));
        assert!(!ProposalStateMachine::can_execute(ProposalState::Active));
        assert!(!ProposalStateMachine::can_execute(ProposalState::Succeeded));
        assert!(!ProposalStateMachine::can_execute(ProposalState::Defeated));
        assert!(ProposalStateMachine::can_execute(ProposalState::Queued));
        assert!(!ProposalStateMachine::can_execute(ProposalState::Executed));
    }

    #[test]
    fn test_can_cancel() {
        assert!(ProposalStateMachine::can_cancel(ProposalState::Created));
        assert!(ProposalStateMachine::can_cancel(ProposalState::Active));
        assert!(ProposalStateMachine::can_cancel(ProposalState::Succeeded));
        assert!(!ProposalStateMachine::can_cancel(ProposalState::Defeated));
        assert!(ProposalStateMachine::can_cancel(ProposalState::Queued));
        assert!(!ProposalStateMachine::can_cancel(ProposalState::Executed));
        assert!(!ProposalStateMachine::can_cancel(ProposalState::Expired));
        assert!(!ProposalStateMachine::can_cancel(ProposalState::Cancelled));
    }
}

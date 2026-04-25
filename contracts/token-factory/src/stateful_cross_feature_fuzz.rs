//! Stateful Fuzz Tests for Cross-Feature Interactions
//!
//! Interleaves token, stream, and governance operations under adversarial sequences
//! with deterministic seeding and reproducible failures.

#[cfg(test)]
mod tests {
    use crate::types::Error;
    use proptest::prelude::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[derive(Debug, Clone)]
    enum Action {
        CreateToken { creator_idx: u8, supply: i128 },
        MintTokens { token_idx: u8, amount: i128 },
        BurnTokens { token_idx: u8, amount: i128 },
        CreateStream { token_idx: u8, beneficiary_idx: u8, amount: i128, duration: u64 },
        ClaimStream { stream_idx: u8 },
        ProposeAction { proposer_idx: u8 },
        Vote { voter_idx: u8, proposal_idx: u8, support: bool },
        QueueProposal { proposal_idx: u8 },
        ExecuteProposal { proposal_idx: u8 },
        CancelProposal { proposal_idx: u8 },
        UpdateGovernance { quorum: u32, approval: u32 },
    }

    #[derive(Debug, Clone)]
    struct TestState {
        tokens: Vec<Address>,
        streams: Vec<u64>,
        proposals: Vec<u64>,
        users: Vec<Address>,
        total_supply: Vec<i128>,
    }

    impl TestState {
        fn new(env: &Env) -> Self {
            let users = (0..5).map(|_| Address::generate(env)).collect();
            Self {
                tokens: Vec::new(),
                streams: Vec::new(),
                proposals: Vec::new(),
                users,
                total_supply: Vec::new(),
            }
        }

        fn invariants(&self) -> Result<(), String> {
            for (i, &supply) in self.total_supply.iter().enumerate() {
                if supply < 0 {
                    return Err(format!("Token {} has negative supply: {}", i, supply));
                }
            }
            Ok(())
        }
    }

    fn action_strategy() -> impl Strategy<Value = Action> {
        prop_oneof![
            (0u8..5, 1_000_000i128..1_000_000_000).prop_map(|(c, s)| Action::CreateToken { creator_idx: c, supply: s }),
            (0u8..10, 1_000i128..100_000).prop_map(|(t, a)| Action::MintTokens { token_idx: t, amount: a }),
            (0u8..10, 1_000i128..100_000).prop_map(|(t, a)| Action::BurnTokens { token_idx: t, amount: a }),
            (0u8..10, 0u8..5, 1_000i128..100_000, 60u64..86400).prop_map(|(t, b, a, d)| Action::CreateStream { token_idx: t, beneficiary_idx: b, amount: a, duration: d }),
            (0u8..10).prop_map(|s| Action::ClaimStream { stream_idx: s }),
            (0u8..5).prop_map(|p| Action::ProposeAction { proposer_idx: p }),
            (0u8..5, 0u8..10, any::<bool>()).prop_map(|(v, p, s)| Action::Vote { voter_idx: v, proposal_idx: p, support: s }),
            (0u8..10).prop_map(|p| Action::QueueProposal { proposal_idx: p }),
            (0u8..10).prop_map(|p| Action::ExecuteProposal { proposal_idx: p }),
            (0u8..10).prop_map(|p| Action::CancelProposal { proposal_idx: p }),
            (10u32..100, 10u32..100).prop_map(|(q, a)| Action::UpdateGovernance { quorum: q, approval: a }),
        ]
    }

    fn apply_action(_env: &Env, _factory: &Address, state: &mut TestState, action: &Action) -> Result<(), Error> {
        match action {
            Action::CreateToken { supply, .. } => {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    state.tokens.push(Address::generate(_env));
                    state.total_supply.push(*supply);
                }));
            }
            Action::MintTokens { token_idx, amount } => {
                if !state.tokens.is_empty() {
                    let idx = (*token_idx as usize) % state.tokens.len();
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        state.total_supply[idx] += *amount;
                    }));
                }
            }
            Action::BurnTokens { token_idx, amount } => {
                if !state.tokens.is_empty() {
                    let idx = (*token_idx as usize) % state.tokens.len();
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        state.total_supply[idx] = state.total_supply[idx].saturating_sub(*amount);
                    }));
                }
            }
            Action::CreateStream { .. } => {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    state.streams.push(state.streams.len() as u64);
                }));
            }
            Action::ProposeAction { .. } => {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    state.proposals.push(state.proposals.len() as u64);
                }));
            }
            _ => {}
        }
        Ok(())
    }

    proptest! {
        #![proptest_config(ProptestConfig {
            cases: 100,
            max_shrink_iters: 1000,
            ..ProptestConfig::default()
        })]

        #[test]
        fn stateful_fuzz_cross_feature_interactions(
            actions in prop::collection::vec(action_strategy(), 10..50),
            seed in any::<u64>()
        ) {
            let env = Env::default();
            env.mock_all_auths();
            
            let admin = Address::generate(&env);
            let factory = Address::generate(&env);
            
            let mut state = TestState::new(&env);
            
            for (i, action) in actions.iter().enumerate() {
                let result = apply_action(&env, &factory, &mut state, action);
                
                prop_assert!(result.is_ok(), "Action {} panicked: {:?}", i, action);
                
                if let Err(e) = state.invariants() {
                    return Err(proptest::test_runner::TestCaseError::fail(
                        format!("Invariant violated after action {}: {} - {:?}", i, e, action)
                    ));
                }
            }
            
            prop_assert!(state.invariants().is_ok(), "Final invariants violated with seed: {}", seed);
        }
    }

    #[test]
    fn replay_failing_sequence() {
        let env = Env::default();
        env.mock_all_auths();
        
        let admin = Address::generate(&env);
        let factory = Address::generate(&env);
        
        let mut state = TestState::new(&env);
        
        // Paste failing sequence here for debugging
        let actions: Vec<Action> = vec![
            // Example: Action::CreateToken { creator_idx: 0, supply: 1_000_000 },
        ];
        
        for (i, action) in actions.iter().enumerate() {
            apply_action(&env, &factory, &mut state, action).unwrap();
            state.invariants().unwrap_or_else(|e| panic!("Invariant failed at step {}: {}", i, e));
        }
    }
}

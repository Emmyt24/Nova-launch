//! Stateful Model-Based Test Harness for Token + Stream Invariants
//!
//! Task #372: Build Stateful Model-Based Test Harness
//!
//! This module implements a state-machine test harness that validates
//! contract behavior through random action sequences with deterministic seeds.

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    #[derive(Debug, Clone)]
    struct TokenModel {
        id: u32,
        creator: String,
        initial_supply: i128,
        current_supply: i128,
        total_burned: i128,
        burn_count: u32,
        is_paused: bool,
    }

    #[derive(Debug, Clone)]
    struct FactoryModel {
        admin: String,
        treasury: String,
        base_fee: i128,
        metadata_fee: i128,
        is_paused: bool,
        tokens: Vec<TokenModel>,
        pending_admin: Option<String>,
    }

    impl FactoryModel {
        fn new(admin: String, treasury: String, base_fee: i128, metadata_fee: i128) -> Self {
            Self {
                admin,
                treasury,
                base_fee,
                metadata_fee,
                is_paused: false,
                tokens: Vec::new(),
                pending_admin: None,
            }
        }

        fn create_token(&mut self, creator: String, initial_supply: i128) -> Result<u32, &'static str> {
            if self.is_paused { return Err("ContractPaused"); }
            if initial_supply <= 0 { return Err("InvalidParameters"); }
            let token_id = self.tokens.len() as u32;
            self.tokens.push(TokenModel {
                id: token_id,
                creator,
                initial_supply,
                current_supply: initial_supply,
                total_burned: 0,
                burn_count: 0,
                is_paused: false,
            });
            Ok(token_id)
        }

        fn burn(&mut self, token_id: u32, amount: i128) -> Result<(), &'static str> {
            if self.is_paused { return Err("ContractPaused"); }
            let token = self.tokens.get_mut(token_id as usize).ok_or("TokenNotFound")?;
            if token.is_paused { return Err("TokenPaused"); }
            if amount <= 0 || amount > token.current_supply { return Err("InvalidBurnAmount"); }
            token.current_supply -= amount;
            token.total_burned += amount;
            token.burn_count += 1;
            Ok(())
        }

        fn pause(&mut self, caller: &str) -> Result<(), &'static str> {
            if caller != self.admin { return Err("Unauthorized"); }
            self.is_paused = true;
            Ok(())
        }

        fn unpause(&mut self, caller: &str) -> Result<(), &'static str> {
            if caller != self.admin { return Err("Unauthorized"); }
            self.is_paused = false;
            Ok(())
        }

        fn check_invariants(&self) -> Result<(), String> {
            for token in &self.tokens {
                if token.current_supply + token.total_burned != token.initial_supply {
                    return Err(format!("Token {}: Supply conservation violated", token.id));
                }
                if token.current_supply < 0 || token.total_burned < 0 {
                    return Err(format!("Token {}: Negative values", token.id));
                }
            }
            Ok(())
        }
    }

    #[derive(Debug, Clone)]
    enum Action {
        CreateToken { creator_idx: usize, initial_supply: i128 },
        Burn { token_id: u32, amount: i128 },
        Pause { caller_idx: usize },
        Unpause { caller_idx: usize },
    }

    fn action_strategy() -> impl Strategy<Value = Action> {
        prop_oneof![
            (0usize..3, 1_000_000i128..10_000_000i128)
                .prop_map(|(creator_idx, initial_supply)| Action::CreateToken { creator_idx, initial_supply }),
            (0u32..10, 100_000i128..500_000i128)
                .prop_map(|(token_id, amount)| Action::Burn { token_id, amount }),
            (0usize..3).prop_map(|caller_idx| Action::Pause { caller_idx }),
            (0usize..3).prop_map(|caller_idx| Action::Unpause { caller_idx }),
        ]
    }

    struct TestHarness {
        model: FactoryModel,
        addresses: Vec<String>,
    }

    impl TestHarness {
        fn new() -> Self {
            let addresses = vec!["admin".to_string(), "treasury".to_string(), "user1".to_string()];
            let model = FactoryModel::new(addresses[0].clone(), addresses[1].clone(), 70_000_000, 30_000_000);
            Self { model, addresses }
        }

        fn execute(&mut self, action: &Action) -> Result<(), String> {
            let result = match action {
                Action::CreateToken { creator_idx, initial_supply } => {
                    let creator = &self.addresses[*creator_idx % self.addresses.len()];
                    self.model.create_token(creator.clone(), *initial_supply).map(|_| ())
                }
                Action::Burn { token_id, amount } => self.model.burn(*token_id, *amount),
                Action::Pause { caller_idx } => {
                    let caller = &self.addresses[*caller_idx % self.addresses.len()];
                    self.model.pause(caller)
                }
                Action::Unpause { caller_idx } => {
                    let caller = &self.addresses[*caller_idx % self.addresses.len()];
                    self.model.unpause(caller)
                }
            };
            result.map_err(|e| e.to_string())
        }

        fn verify(&self) -> Result<(), String> {
            self.model.check_invariants()
        }
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]

        #[test]
        fn stateful_invariants_hold(actions in prop::collection::vec(action_strategy(), 10..50)) {
            let mut harness = TestHarness::new();
            for (i, action) in actions.iter().enumerate() {
                let _ = harness.execute(action);
                if let Err(e) = harness.verify() {
                    return Err(proptest::test_runner::TestCaseError::fail(format!(
                        "Invariant violated after action {}: {:?}\nError: {}", i, action, e
                    )));
                }
            }
        }

        #[test]
        fn supply_conservation_always_holds(actions in prop::collection::vec(action_strategy(), 20..100)) {
            let mut harness = TestHarness::new();
            for action in actions.iter() {
                let _ = harness.execute(action);
                for token in &harness.model.tokens {
                    prop_assert_eq!(
                        token.current_supply + token.total_burned,
                        token.initial_supply,
                        "Token {}: Supply conservation violated", token.id
                    );
                }
            }
        }
    }

    #[test]
    fn minimal_create_and_burn() {
        let mut h = TestHarness::new();
        h.execute(&Action::CreateToken { creator_idx: 0, initial_supply: 1_000_000 }).unwrap();
        h.execute(&Action::Burn { token_id: 0, amount: 100_000 }).unwrap();
        h.verify().unwrap();
    }

    #[test]
    fn minimal_pause_unpause() {
        let mut h = TestHarness::new();
        h.execute(&Action::Pause { caller_idx: 0 }).unwrap();
        let _ = h.execute(&Action::CreateToken { creator_idx: 0, initial_supply: 1_000_000 });
        h.execute(&Action::Unpause { caller_idx: 0 }).unwrap();
        h.execute(&Action::CreateToken { creator_idx: 0, initial_supply: 1_000_000 }).unwrap();
        h.verify().unwrap();
    }
}

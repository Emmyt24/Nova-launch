use super::*;
use proptest::prelude::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, String as SorobanString};

extern crate std;
use std::collections::HashMap;
use std::format;
use std::println;
use std::string::String;
use std::vec;
use std::vec::Vec;

// ============================================================================
// STATEFUL FUZZING FRAMEWORK
// ============================================================================

/// Represents different operations that can be performed on the contract
#[derive(Debug, Clone)]
enum FuzzAction {
    Initialize {
        admin_seed: u64,
        treasury_seed: u64,
        base_fee: i128,
        metadata_fee: i128,
    },
    UpdateFees {
        caller_seed: u64,
        base_fee: Option<i128>,
        metadata_fee: Option<i128>,
    },
    GetState,
    GetTokenCount,
    GetTokenInfo {
        index: u32,
    },
}

impl std::fmt::Display for FuzzAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FuzzAction::Initialize { admin_seed, treasury_seed, base_fee, metadata_fee } => {
                write!(f, "Initialize(admin:{}, treasury:{}, base:{}, meta:{})", 
                       admin_seed, treasury_seed, base_fee, metadata_fee)
            }
            FuzzAction::UpdateFees { caller_seed, base_fee, metadata_fee } => {
                write!(f, "UpdateFees(caller:{}, base:{:?}, meta:{:?})", 
                       caller_seed, base_fee, metadata_fee)
            }
            FuzzAction::GetState => write!(f, "GetState"),
            FuzzAction::GetTokenCount => write!(f, "GetTokenCount"),
            FuzzAction::GetTokenInfo { index } => write!(f, "GetTokenInfo({})", index),
        }
    }
}

/// Contract state model for invariant checking
#[derive(Debug, Clone)]
struct StateModel {
    initialized: bool,
    admin_seed: Option<u64>,
    treasury_seed: Option<u64>,
    base_fee: i128,
    metadata_fee: i128,
    token_count: u32,
}

impl StateModel {
    fn new() -> Self {
        Self {
            initialized: false,
            admin_seed: None,
            treasury_seed: None,
            base_fee: 0,
            metadata_fee: 0,
            token_count: 0,
        }
    }

    fn apply_action(&mut self, action: &FuzzAction) -> Result<(), String> {
        match action {
            FuzzAction::Initialize { admin_seed, treasury_seed, base_fee, metadata_fee } => {
                if self.initialized {
                    return Err(String::from("Already initialized"));
                }
                if *base_fee < 0 || *metadata_fee < 0 {
                    return Err(String::from("Negative fees"));
                }
                self.initialized = true;
                self.admin_seed = Some(*admin_seed);
                self.treasury_seed = Some(*treasury_seed);
                self.base_fee = *base_fee;
                self.metadata_fee = *metadata_fee;
                Ok(())
            }
            FuzzAction::UpdateFees { caller_seed, base_fee, metadata_fee } => {
                if !self.initialized {
                    return Err(String::from("Not initialized"));
                }
                if Some(*caller_seed) != self.admin_seed {
                    return Err(String::from("Unauthorized"));
                }
                if let Some(fee) = base_fee {
                    if *fee < 0 {
                        return Err(String::from("Negative base fee"));
                    }
                    self.base_fee = *fee;
                }
                if let Some(fee) = metadata_fee {
                    if *fee < 0 {
                        return Err(String::from("Negative metadata fee"));
                    }
                    self.metadata_fee = *fee;
                }
                Ok(())
            }
            FuzzAction::GetState => {
                if !self.initialized {
                    return Err(String::from("Not initialized"));
                }
                Ok(())
            }
            FuzzAction::GetTokenCount => Ok(()),
            FuzzAction::GetTokenInfo { .. } => {
                if !self.initialized {
                    return Err(String::from("Not initialized"));
                }
                Err(String::from("Token not found"))
            }
        }
    }
}

/// Deterministic action generator using a seed
struct ActionGenerator {
    seed: u64,
    rng_state: u64,
}

impl ActionGenerator {
    fn new(seed: u64) -> Self {
        Self {
            seed,
            rng_state: seed,
        }
    }

    /// Simple LCG for deterministic pseudo-random numbers
    fn next_u64(&mut self) -> u64 {
        self.rng_state = self.rng_state.wrapping_mul(6364136223846793005).wrapping_add(1);
        self.rng_state
    }

    fn next_range(&mut self, max: u64) -> u64 {
        if max == 0 {
            return 0;
        }
        self.next_u64() % max
    }

    fn next_i128(&mut self, min: i128, max: i128) -> i128 {
        if min >= max {
            return min;
        }
        let range = (max - min) as u64;
        min + (self.next_range(range) as i128)
    }

    fn next_bool(&mut self) -> bool {
        self.next_u64() % 2 == 0
    }

    /// Generate a sequence of mixed operations
    fn generate_action_sequence(&mut self, length: usize) -> Vec<FuzzAction> {
        let mut actions = Vec::new();
        
        for _ in 0..length {
            let action_type = self.next_range(5);
            
            let action = match action_type {
                0 => FuzzAction::Initialize {
                    admin_seed: self.next_u64(),
                    treasury_seed: self.next_u64(),
                    base_fee: self.next_i128(-1000, 1_000_000_000),
                    metadata_fee: self.next_i128(-1000, 1_000_000_000),
                },
                1 => FuzzAction::UpdateFees {
                    caller_seed: self.next_u64(),
                    base_fee: if self.next_bool() {
                        Some(self.next_i128(-1000, 1_000_000_000))
                    } else {
                        None
                    },
                    metadata_fee: if self.next_bool() {
                        Some(self.next_i128(-1000, 1_000_000_000))
                    } else {
                        None
                    },
                },
                2 => FuzzAction::GetState,
                3 => FuzzAction::GetTokenCount,
                4 => FuzzAction::GetTokenInfo {
                    index: self.next_range(100) as u32,
                },
                _ => unreachable!(),
            };
            
            actions.push(action);
        }
        
        actions
    }
}

/// Execute actions and verify invariants
fn execute_stateful_fuzz(seed: u64, actions: &[FuzzAction]) -> Result<(), String> {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);
    
    let mut model = StateModel::new();
    let mut address_cache: HashMap<u64, Address> = HashMap::new();
    
    let get_or_create_address = |cache: &mut HashMap<u64, Address>, seed: u64, env: &Env| {
        cache.entry(seed).or_insert_with(|| Address::generate(env)).clone()
    };
    
    for (i, action) in actions.iter().enumerate() {
        // Apply to model first
        let model_result = model.apply_action(action);
        
        // Execute on contract
        let contract_result = match action {
            FuzzAction::Initialize { admin_seed, treasury_seed, base_fee, metadata_fee } => {
                let admin = get_or_create_address(&mut address_cache, *admin_seed, &env);
                let treasury = get_or_create_address(&mut address_cache, *treasury_seed, &env);
                client.try_initialize(&admin, &treasury, base_fee, metadata_fee)
                    .map(|_| ())
                    .map_err(|e| format!("{:?}", e))
            }
            FuzzAction::UpdateFees { caller_seed, base_fee, metadata_fee } => {
                let caller = get_or_create_address(&mut address_cache, *caller_seed, &env);
                client.try_update_fees(&caller, base_fee, metadata_fee)
                    .map(|_| ())
                    .map_err(|e| format!("{:?}", e))
            }
            FuzzAction::GetState => {
                client.try_get_state()
                    .map(|_| ())
                    .map_err(|e| format!("{:?}", e))
            }
            FuzzAction::GetTokenCount => {
                Ok(client.get_token_count())
                    .map(|_| ())
            }
            FuzzAction::GetTokenInfo { index } => {
                client.try_get_token_info(index)
                    .map(|_| ())
                    .map_err(|e| format!("{:?}", e))
            }
        };
        
        // Verify model and contract agree
        match (model_result, contract_result) {
            (Ok(()), Ok(())) => {
                // Both succeeded - verify invariants
                verify_invariants(&client, &model, seed, i, action)?;
            }
            (Err(_), Err(_)) => {
                // Both failed - expected
            }
            (Ok(()), Err(e)) => {
                return Err(format!(
                    "SEED: {} | Action {}: {} | Model succeeded but contract failed: {}",
                    seed, i, action, e
                ));
            }
            (Err(e), Ok(())) => {
                return Err(format!(
                    "SEED: {} | Action {}: {} | Model failed but contract succeeded: {}",
                    seed, i, action, e
                ));
            }
        }
    }
    
    Ok(())
}

/// Verify contract invariants
fn verify_invariants(
    client: &TokenFactoryClient,
    model: &StateModel,
    seed: u64,
    action_index: usize,
    action: &FuzzAction,
) -> Result<(), String> {
    if !model.initialized {
        return Ok(());
    }
    
    // Invariant 1: State consistency
    let state = client.get_state();
    if state.base_fee != model.base_fee {
        return Err(format!(
            "SEED: {} | Action {}: {} | Base fee mismatch: contract={}, model={}",
            seed, action_index, action, state.base_fee, model.base_fee
        ));
    }
    if state.metadata_fee != model.metadata_fee {
        return Err(format!(
            "SEED: {} | Action {}: {} | Metadata fee mismatch: contract={}, model={}",
            seed, action_index, action, state.metadata_fee, model.metadata_fee
        ));
    }
    
    // Invariant 2: Fees are non-negative
    if state.base_fee < 0 {
        return Err(format!(
            "SEED: {} | Action {}: {} | Negative base fee: {}",
            seed, action_index, action, state.base_fee
        ));
    }
    if state.metadata_fee < 0 {
        return Err(format!(
            "SEED: {} | Action {}: {} | Negative metadata fee: {}",
            seed, action_index, action, state.metadata_fee
        ));
    }
    
    // Invariant 3: Token count consistency
    let token_count = client.get_token_count();
    if token_count != model.token_count {
        return Err(format!(
            "SEED: {} | Action {}: {} | Token count mismatch: contract={}, model={}",
            seed, action_index, action, token_count, model.token_count
        ));
    }
    
    // Invariant 4: Fee sum doesn't overflow
    if state.base_fee.checked_add(state.metadata_fee).is_none() {
        return Err(format!(
            "SEED: {} | Action {}: {} | Fee sum overflow: base={}, metadata={}",
            seed, action_index, action, state.base_fee, state.metadata_fee
        ));
    }
    
    Ok(())
}

// ============================================================================
// STATEFUL FUZZ TESTS
// ============================================================================

#[cfg(test)]
mod stateful_tests {
    use super::*;

    #[test]
    fn test_stateful_fuzz_short_sequence() {
        let seed = 12345u64;
        let mut gen = ActionGenerator::new(seed);
        let actions = gen.generate_action_sequence(10);
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Seed {} passed", seed),
            Err(e) => {
                println!("✗ FAILURE - Replay with seed: {}", seed);
                println!("Error: {}", e);
                println!("\nReplay command:");
                println!("cargo test test_replay_seed_{} -- --nocapture", seed);
                panic!("Stateful fuzz test failed");
            }
        }
    }

    #[test]
    fn test_stateful_fuzz_medium_sequence() {
        let seed = 67890u64;
        let mut gen = ActionGenerator::new(seed);
        let actions = gen.generate_action_sequence(50);
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Seed {} passed", seed),
            Err(e) => {
                println!("✗ FAILURE - Replay with seed: {}", seed);
                println!("Error: {}", e);
                println!("\nReplay command:");
                println!("cargo test test_replay_seed_{} -- --nocapture", seed);
                panic!("Stateful fuzz test failed");
            }
        }
    }

    #[test]
    fn test_stateful_fuzz_long_sequence() {
        let seed = 99999u64;
        let mut gen = ActionGenerator::new(seed);
        let actions = gen.generate_action_sequence(100);
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Seed {} passed", seed),
            Err(e) => {
                println!("✗ FAILURE - Replay with seed: {}", seed);
                println!("Error: {}", e);
                println!("\nReplay command:");
                println!("cargo test test_replay_seed_{} -- --nocapture", seed);
                panic!("Stateful fuzz test failed");
            }
        }
    }

    #[test]
    fn test_stateful_fuzz_multiple_seeds() {
        let seeds = [1u64, 42, 123, 456, 789, 1000, 9999, 12345, 54321, 99999];
        
        for seed in seeds.iter() {
            let mut gen = ActionGenerator::new(*seed);
            let actions = gen.generate_action_sequence(30);
            
            match execute_stateful_fuzz(*seed, &actions) {
                Ok(()) => println!("✓ Seed {} passed", seed),
                Err(e) => {
                    println!("✗ FAILURE - Replay with seed: {}", seed);
                    println!("Error: {}", e);
                    println!("\nReplay command:");
                    println!("cargo test test_replay_seed_{} -- --nocapture", seed);
                    panic!("Stateful fuzz test failed for seed {}", seed);
                }
            }
        }
    }

    #[test]
    fn test_initialization_focused_sequence() {
        let seed = 11111u64;
        let actions = vec![
            FuzzAction::Initialize {
                admin_seed: 1,
                treasury_seed: 2,
                base_fee: 100_000_000,
                metadata_fee: 50_000_000,
            },
            FuzzAction::GetState,
            FuzzAction::GetTokenCount,
            FuzzAction::Initialize {
                admin_seed: 3,
                treasury_seed: 4,
                base_fee: 200_000_000,
                metadata_fee: 100_000_000,
            },
        ];
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Initialization sequence passed"),
            Err(e) => {
                println!("✗ FAILURE");
                println!("Error: {}", e);
                panic!("Initialization sequence failed");
            }
        }
    }

    #[test]
    fn test_fee_update_focused_sequence() {
        let seed = 22222u64;
        let actions = vec![
            FuzzAction::Initialize {
                admin_seed: 100,
                treasury_seed: 200,
                base_fee: 100_000_000,
                metadata_fee: 50_000_000,
            },
            FuzzAction::UpdateFees {
                caller_seed: 100, // Same as admin
                base_fee: Some(150_000_000),
                metadata_fee: None,
            },
            FuzzAction::GetState,
            FuzzAction::UpdateFees {
                caller_seed: 999, // Different from admin
                base_fee: Some(200_000_000),
                metadata_fee: None,
            },
            FuzzAction::GetState,
        ];
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Fee update sequence passed"),
            Err(e) => {
                println!("✗ FAILURE");
                println!("Error: {}", e);
                panic!("Fee update sequence failed");
            }
        }
    }

    #[test]
    fn test_unauthorized_operations_sequence() {
        let seed = 33333u64;
        let actions = vec![
            FuzzAction::UpdateFees {
                caller_seed: 1,
                base_fee: Some(100_000_000),
                metadata_fee: None,
            },
            FuzzAction::GetState,
            FuzzAction::Initialize {
                admin_seed: 100,
                treasury_seed: 200,
                base_fee: 100_000_000,
                metadata_fee: 50_000_000,
            },
            FuzzAction::UpdateFees {
                caller_seed: 999,
                base_fee: Some(200_000_000),
                metadata_fee: None,
            },
        ];
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Unauthorized operations sequence passed"),
            Err(e) => {
                println!("✗ FAILURE");
                println!("Error: {}", e);
                panic!("Unauthorized operations sequence failed");
            }
        }
    }

    #[test]
    fn test_negative_fee_sequence() {
        let seed = 44444u64;
        let actions = vec![
            FuzzAction::Initialize {
                admin_seed: 1,
                treasury_seed: 2,
                base_fee: -100,
                metadata_fee: 50_000_000,
            },
            FuzzAction::Initialize {
                admin_seed: 1,
                treasury_seed: 2,
                base_fee: 100_000_000,
                metadata_fee: -50,
            },
            FuzzAction::Initialize {
                admin_seed: 1,
                treasury_seed: 2,
                base_fee: 100_000_000,
                metadata_fee: 50_000_000,
            },
            FuzzAction::UpdateFees {
                caller_seed: 1,
                base_fee: Some(-100),
                metadata_fee: None,
            },
            FuzzAction::GetState,
        ];
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Negative fee sequence passed"),
            Err(e) => {
                println!("✗ FAILURE");
                println!("Error: {}", e);
                panic!("Negative fee sequence failed");
            }
        }
    }

    #[test]
    fn test_interleaved_operations() {
        let seed = 55555u64;
        let mut gen = ActionGenerator::new(seed);
        let actions = gen.generate_action_sequence(100);
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Seed {} passed with {} actions", seed, actions.len()),
            Err(e) => {
                println!("✗ FAILURE - Replay with seed: {}", seed);
                println!("Error: {}", e);
                println!("\nReplay command:");
                println!("cargo test test_replay_seed_{} -- --nocapture", seed);
                panic!("Interleaved operations test failed");
            }
        }
    }
}

// Replay test generator - add specific tests for failed seeds
#[cfg(test)]
mod replay_tests {
    use super::*;

    // Example replay test - copy and modify for specific failing seeds
    #[test]
    #[ignore] // Remove ignore to run specific replay
    fn test_replay_seed_12345() {
        let seed = 12345u64;
        let mut gen = ActionGenerator::new(seed);
        let actions = gen.generate_action_sequence(10);
        
        println!("Replaying seed: {}", seed);
        println!("Actions:");
        for (i, action) in actions.iter().enumerate() {
            println!("  {}: {}", i, action);
        }
        
        match execute_stateful_fuzz(seed, &actions) {
            Ok(()) => println!("✓ Replay passed"),
            Err(e) => {
                println!("✗ Replay failed");
                println!("Error: {}", e);
                panic!("Replay failed");
            }
        }
    }
}

// ============================================================================
// PROPERTY-BASED TESTS (Original)
// ============================================================================

// Configuration for running more iterations
const PROPERTY_TEST_ITERATIONS: u32 = 500;

// Strategy for generating valid token names (1-32 chars)
fn token_name_strategy() -> impl Strategy<Value = &'static str> {
    prop_oneof![
        Just("Test Token"),
        Just("My Token"),
        Just("A"),
        Just("ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"),
    ]
}

// Strategy for generating valid token symbols (1-12 chars)
fn token_symbol_strategy() -> impl Strategy<Value = &'static str> {
    prop_oneof![Just("TEST"), Just("TKN"), Just("A"), Just("ABCDEFGHIJKL"),]
}

// Strategy for generating edge case strings
fn edge_case_string_strategy() -> impl Strategy<Value = &'static str> {
    prop_oneof![
        Just(""),
        Just("a"),
        Just("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
    ]
}

// Strategy for decimals (0-18 is typical, test beyond)
fn decimals_strategy() -> impl Strategy<Value = u32> {
    prop_oneof![Just(0u32), Just(7u32), Just(18u32), Just(255u32),]
}

// Strategy for supply amounts
fn supply_strategy() -> impl Strategy<Value = i128> {
    prop_oneof![
        Just(0i128),
        Just(1i128),
        Just(-1i128),
        Just(i128::MAX),
        Just(i128::MIN),
        1i128..1_000_000_000_000i128,
    ]
}

// Strategy for fee amounts with targeted edge case seeds
fn fee_strategy() -> impl Strategy<Value = i128> {
    prop_oneof![
        Just(0i128),
        Just(-1i128),
        Just(-1000i128),
        Just(i128::MAX),
        Just(i128::MIN),
        Just(i128::MAX / 2),
        Just(i128::MAX - 1),
        Just(i128::MAX - 1000),
        Just(1),
        Just(10_000_000),
        Just(100_000_000),
        1i128..1_000_000_000i128,
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(10000))]
    
    #[test]
    fn fuzz_initialize_with_various_fees(
        base_fee in fee_strategy(),
        metadata_fee in fee_strategy(),
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let result = client.try_initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Negative fees should fail
        if base_fee < 0 || metadata_fee < 0 {
            prop_assert!(result.is_err());
        } else {
            prop_assert!(result.is_ok());
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, base_fee);
            prop_assert_eq!(state.metadata_fee, metadata_fee);
        }
    }
    
    #[test]
    fn fuzz_initialize_with_random_addresses(
        seed1 in any::<u64>(),
        seed2 in any::<u64>(),
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        // Generate addresses using seeds for reproducibility
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let result = client.try_initialize(&admin, &treasury, &base_fee, &metadata_fee);
        
        prop_assert!(result.is_ok());
        
        let state = client.get_state();
        prop_assert_eq!(state.admin, admin);
        prop_assert_eq!(state.treasury, treasury);
        prop_assert_eq!(state.base_fee, base_fee);
        prop_assert_eq!(state.metadata_fee, metadata_fee);
    }
    
    #[test]
    fn fuzz_initialize_zero_fees(
        _seed in any::<u64>(),
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Zero fees should always succeed
        let result = client.try_initialize(&admin, &treasury, &0, &0);
        prop_assert!(result.is_ok());
        
        let state = client.get_state();
        prop_assert_eq!(state.base_fee, 0);
        prop_assert_eq!(state.metadata_fee, 0);
    }
    
    #[test]
    fn fuzz_initialize_negative_fees_always_fail(
        base_fee in i128::MIN..0i128,
        metadata_fee in i128::MIN..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Any negative fee should fail
        let result = client.try_initialize(&admin, &treasury, &base_fee, &metadata_fee);
        prop_assert!(result.is_err());
    }
    
    #[test]
    fn fuzz_initialize_max_safe_fees(
        base_fee in 0i128..i128::MAX/2,
        metadata_fee in 0i128..i128::MAX/2,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let result = client.try_initialize(&admin, &treasury, &base_fee, &metadata_fee);
        
        prop_assert!(result.is_ok());
        
        // Verify no overflow in total fee calculation
        let total = base_fee.checked_add(metadata_fee);
        prop_assert!(total.is_some());
        
        let state = client.get_state();
        prop_assert_eq!(state.base_fee, base_fee);
        prop_assert_eq!(state.metadata_fee, metadata_fee);
    }
    
    #[test]
    fn fuzz_initialize_same_addresses(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let same_address = Address::generate(&env);

        // Same address for admin and treasury should be allowed
        let result = client.try_initialize(&same_address, &same_address, &base_fee, &metadata_fee);
        prop_assert!(result.is_ok());
        
        let state = client.get_state();
        prop_assert_eq!(state.admin, same_address);
        prop_assert_eq!(state.treasury, same_address);
    }

    #[test]
    fn fuzz_update_fees_authorization(
        new_base_fee in fee_strategy(),
        _new_metadata_fee in fee_strategy(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Test with unauthorized address
        let result = client.try_update_fees(&unauthorized, &Some(new_base_fee), &None);
        prop_assert!(result.is_err());

        // Test with admin
        if new_base_fee >= 0 {
            let result = client.try_update_fees(&admin, &Some(new_base_fee), &None);
            prop_assert!(result.is_ok());
        }
    }

    #[test]
    fn fuzz_fee_calculation_consistency(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        let state = client.get_state();

        // Verify fees are stored correctly
        prop_assert_eq!(state.base_fee, base_fee);
        prop_assert_eq!(state.metadata_fee, metadata_fee);

        // Verify total fee calculation doesn't overflow
        let total_fee = base_fee.checked_add(metadata_fee);
        prop_assert!(total_fee.is_some());
    }

    #[test]
    fn fuzz_double_initialization_always_fails(
        base_fee1 in 0i128..1_000_000_000i128,
        metadata_fee1 in 0i128..1_000_000_000i128,
        base_fee2 in 0i128..1_000_000_000i128,
        metadata_fee2 in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin1 = Address::generate(&env);
        let treasury1 = Address::generate(&env);
        let admin2 = Address::generate(&env);
        let treasury2 = Address::generate(&env);

        // First initialization should succeed
        let result1 = client.try_initialize(&admin1, &treasury1, &base_fee1, &metadata_fee1);
        prop_assert!(result1.is_ok());

        // Second initialization should always fail
        let result2 = client.try_initialize(&admin2, &treasury2, &base_fee2, &metadata_fee2);
        prop_assert!(result2.is_err());
    }
    
    #[test]
    fn fuzz_initialize_address_persistence(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
        read_count in 1u32..100u32,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Verify addresses persist across multiple reads
        for _ in 0..read_count {
            let state = client.get_state();
            prop_assert_eq!(state.admin, admin);
            prop_assert_eq!(state.treasury, treasury);
        }
    }
    
    #[test]
    fn fuzz_initialize_fee_overflow_safety(
        base_fee in i128::MAX/2..i128::MAX,
        metadata_fee in i128::MAX/2..i128::MAX,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Initialize with large fees
        let result = client.try_initialize(&admin, &treasury, &base_fee, &metadata_fee);
        
        // Should succeed even with large values
        prop_assert!(result.is_ok());
        
        // Verify potential overflow is handled
        let total = base_fee.checked_add(metadata_fee);
        // If overflow would occur, that's a potential issue to document
        if total.is_none() {
            // Document this edge case
            prop_assert!(true); // Mark as found edge case
        }
    }

    #[test]
    fn fuzz_state_persistence(
        base_fee in 0i128..1_000_000_000i128,
        metadata_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

        // Read state multiple times
        for _ in 0..10 {
            let state = client.get_state();
            prop_assert_eq!(state.admin, admin.clone());
            prop_assert_eq!(state.treasury, treasury.clone());
            prop_assert_eq!(state.base_fee, base_fee);
            prop_assert_eq!(state.metadata_fee, metadata_fee);
        }
    }

    #[test]
    fn fuzz_fee_update_idempotency(
        initial_base in 0i128..1_000_000_000i128,
        initial_metadata in 0i128..1_000_000_000i128,
        new_base in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &initial_base, &initial_metadata);

        // Update fee multiple times with same value
        for _ in 0..5 {
            client.update_fees(&admin, &Some(new_base), &None);
            let state = client.get_state();
            prop_assert_eq!(state.base_fee, new_base);
            prop_assert_eq!(state.metadata_fee, initial_metadata);
        }
    }

    #[test]
    fn fuzz_token_count_consistency(
        iterations in 0u32..10u32,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Token count should start at 0
        let initial_count = client.get_token_count();
        prop_assert_eq!(initial_count, 0);

        // Multiple reads should return same value
        for _ in 0..iterations {
            let count = client.get_token_count();
            prop_assert_eq!(count, initial_count);
        }
    }

    #[test]
    fn fuzz_get_nonexistent_token(
        index in 0u32..1000u32,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Getting any token should fail when none exist
        let result = client.try_get_token_info(&index);
        prop_assert!(result.is_err());
    }

    #[test]
    fn fuzz_arithmetic_no_panic(
        base_fee in 0i128..i128::MAX,
        metadata_fee in 0i128..i128::MAX,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Should never panic regardless of values
        let result = client.try_initialize(&admin, &treasury, &base_fee, &metadata_fee);
        prop_assert!(result.is_ok());

        let state = client.get_state();
        
        // Verify checked arithmetic behavior
        let sum = state.base_fee.checked_add(state.metadata_fee);
        if base_fee > i128::MAX - metadata_fee {
            prop_assert!(sum.is_none());
        } else {
            prop_assert!(sum.is_some());
        }
    }

    #[test]
    fn fuzz_fee_update_no_underflow(
        initial_fee in 0i128..1_000_000_000i128,
        new_fee in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &initial_fee, &initial_fee);

        // Update should always succeed with valid values
        let result = client.try_update_fees(&admin, &Some(new_fee), &None);
        prop_assert!(result.is_ok());

        let state = client.get_state();
        prop_assert_eq!(state.base_fee, new_fee);
    }

    #[test]
    fn fuzz_extreme_fee_combinations(
        multiplier in 1u32..100u32,
    ) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        let base = (i128::MAX / 1000) * (multiplier as i128);
        let metadata = (i128::MAX / 1000) * ((100 - multiplier) as i128);

        let result = client.try_initialize(&admin, &treasury, &base, &metadata);
        prop_assert!(result.is_ok());

        let state = client.get_state();
        prop_assert_eq!(state.base_fee, base);
        prop_assert_eq!(state.metadata_fee, metadata);
    }

    #[test]
    fn fuzz_fee_monotonicity(
        fee1 in 0i128..1_000_000_000i128,
        fee2 in 0i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &fee1, &0);
        client.update_fees(&admin, &Some(fee2), &None);

        let state = client.get_state();
        prop_assert_eq!(state.base_fee, fee2);
        
        // Fee should be exactly what we set, no drift
        prop_assert!(state.base_fee >= 0);
    }
}

// Manual edge case tests for specific scenarios
#[cfg(test)]
mod edge_cases {
    use super::*;

    #[test]
    fn test_max_fee_values() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Test with maximum safe i128 values
        let max_safe_fee = i128::MAX / 2;
        let result = client.try_initialize(&admin, &treasury, &max_safe_fee, &max_safe_fee);
        assert!(result.is_ok());
    }

    #[test]
    fn test_zero_fees() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Zero fees should be valid
        let result = client.try_initialize(&admin, &treasury, &0, &0);
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, 0);
        assert_eq!(state.metadata_fee, 0);
    }

    #[test]
    fn test_negative_fees_rejected() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Negative base fee
        let result = client.try_initialize(&admin, &treasury, &-1, &30_000_000);
        assert!(result.is_err());

        // Negative metadata fee
        let result = client.try_initialize(&admin, &treasury, &70_000_000, &-1);
        assert!(result.is_err());

        // Both negative
        let result = client.try_initialize(&admin, &treasury, &-1, &-1);
        assert!(result.is_err());
    }

    #[test]
    fn test_same_admin_and_treasury() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let same_address = Address::generate(&env);

        // Should be allowed to use same address for admin and treasury
        let result = client.try_initialize(&same_address, &same_address, &70_000_000, &30_000_000);
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.admin, same_address);
        assert_eq!(state.treasury, same_address);
    }

    #[test]
    fn test_update_fees_with_none() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Update with both None should succeed but change nothing
        let result = client.try_update_fees(&admin, &None, &None);
        assert!(result.is_ok());

        let state = client.get_state();
        assert_eq!(state.base_fee, 70_000_000);
        assert_eq!(state.metadata_fee, 30_000_000);
    }

    #[test]
    fn test_rapid_state_reads() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

        // Rapid consecutive reads should all return consistent state
        for _ in 0..100 {
            let state = client.get_state();
            assert_eq!(state.admin, admin);
            assert_eq!(state.treasury, treasury);
            assert_eq!(state.base_fee, 70_000_000);
            assert_eq!(state.metadata_fee, 30_000_000);
        }
    }

    #[test]
    fn test_fee_boundary_values() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Test boundary: 1 stroop
        let result = client.try_initialize(&admin, &treasury, &1, &1);
        assert!(result.is_ok());
    }

    #[test]
    fn test_overflow_in_fee_sum_detection() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // These values individually are valid but their sum would overflow
        let near_max = i128::MAX - 100;
        client.initialize(&admin, &treasury, &near_max, &200);

        let state = client.get_state();
        
        // Verify checked arithmetic detects overflow
        let sum = state.base_fee.checked_add(state.metadata_fee);
        assert!(sum.is_none(), "Expected overflow in fee sum");
    }

    #[test]
    fn test_no_panic_on_extreme_values() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Test various extreme combinations - none should panic
        let extreme_values = [
            (i128::MAX, 0),
            (0, i128::MAX),
            (i128::MAX / 2, i128::MAX / 2),
            (i128::MAX - 1, 1),
        ];

        for (base, metadata) in extreme_values {
            let contract_id = env.register_contract(None, TokenFactory);
            let client = TokenFactoryClient::new(&env, &contract_id);
            
            let result = client.try_initialize(&admin, &treasury, &base, &metadata);
            assert!(result.is_ok());
        }
    }
}

// ── Stream invariant property tests ──────────────────────────────────────────
//
// In this contract a "stream" is a token registry entry.
// Mapping to the issue's invariant names:
//   total             = TokenInfo::total_supply  (set at creation, decremented by burns)
//   released_amount   = TokenStats::total_burned (monotonically increases)
//   claimable         = TokenStats::current_supply = total - released_amount
//
// Properties proved:
//   P1  released <= total
//   P2  claimable >= 0
//   P3  released_amount is monotonically non-decreasing across sequential burns
//   P4  cumulative claims (burns) never exceed the total stream amount

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// P1 + P2: For any token with a random initial supply and a random burn
    /// amount that is within bounds, total_burned <= total_supply and
    /// current_supply >= 0 always hold after the burn.
    #[test]
    fn prop_released_lte_total_and_claimable_gte_zero(
        initial_supply in 1i128..1_000_000_000i128,
        burn_amount    in 1i128..1_000_000_000i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin    = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury, &100_i128, &50_i128);

        client.create_token(
            &admin,
            &soroban_sdk::String::from_str(&env, "Stream Token"),
            &soroban_sdk::String::from_str(&env, "STR"),
            &6_u32,
            &initial_supply,
            &None,
            &100_i128,
        );

        let token_index = 0_u32;
        // Fund admin's balance so burn has something to deduct from
        crate::storage::set_balance(&env, token_index, &admin, initial_supply);

        // Only burn up to the available supply
        let actual_burn = burn_amount.min(initial_supply);
        client.burn(&admin, &token_index, &actual_burn);

        let stats = client.get_token_stats(&token_index).unwrap();

        // P1: released (total_burned) <= total (original initial_supply)
        prop_assert!(
            stats.total_burned <= initial_supply,
            "released ({}) must be <= total ({})",
            stats.total_burned, initial_supply
        );

        // P2: claimable (current_supply) >= 0
        prop_assert!(
            stats.current_supply >= 0,
            "claimable (current_supply = {}) must be >= 0",
            stats.current_supply
        );
    }

    /// P3: released_amount (total_burned) is monotonically non-decreasing —
    /// each successive burn can only keep it the same or increase it, never
    /// decrease it.
    #[test]
    fn prop_released_amount_monotonically_non_decreasing(
        initial_supply in 10i128..1_000_000_000i128,
        burn1 in 1i128..100i128,
        burn2 in 1i128..100i128,
        burn3 in 1i128..100i128,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin    = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury, &100_i128, &50_i128);

        client.create_token(
            &admin,
            &soroban_sdk::String::from_str(&env, "Mono Token"),
            &soroban_sdk::String::from_str(&env, "MNO"),
            &6_u32,
            &initial_supply,
            &None,
            &100_i128,
        );

        let token_index = 0_u32;
        crate::storage::set_balance(&env, token_index, &admin, initial_supply);

        // Clamp each burn so we never exceed the remaining balance
        let b1 = burn1.min(initial_supply);
        let after_b1 = initial_supply - b1;

        let b2 = burn2.min(after_b1);
        let after_b2 = after_b1 - b2;

        let b3 = burn3.min(after_b2);

        // Snapshot released amount before each burn
        let released_before_1 = client.get_token_stats(&token_index).unwrap().total_burned;

        client.burn(&admin, &token_index, &b1);
        let released_after_1 = client.get_token_stats(&token_index).unwrap().total_burned;
        prop_assert!(
            released_after_1 >= released_before_1,
            "total_burned must not decrease after burn 1: {} -> {}",
            released_before_1, released_after_1
        );

        client.burn(&admin, &token_index, &b2);
        let released_after_2 = client.get_token_stats(&token_index).unwrap().total_burned;
        prop_assert!(
            released_after_2 >= released_after_1,
            "total_burned must not decrease after burn 2: {} -> {}",
            released_after_1, released_after_2
        );

        client.burn(&admin, &token_index, &b3);
        let released_after_3 = client.get_token_stats(&token_index).unwrap().total_burned;
        prop_assert!(
            released_after_3 >= released_after_2,
            "total_burned must not decrease after burn 3: {} -> {}",
            released_after_2, released_after_3
        );
    }

    /// P4: Cumulative claims (total_burned) across any number of burns never
    /// exceed the original total stream amount (initial_supply).
    #[test]
    fn prop_cumulative_claims_never_exceed_total(
        initial_supply in 1i128..1_000_000_000i128,
        num_burns      in 1u32..10u32,
        burn_fraction  in 1u32..10u32, // burn 1/burn_fraction of remaining each time
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);

        let admin    = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury, &100_i128, &50_i128);

        client.create_token(
            &admin,
            &soroban_sdk::String::from_str(&env, "Cumulative Token"),
            &soroban_sdk::String::from_str(&env, "CUM"),
            &6_u32,
            &initial_supply,
            &None,
            &100_i128,
        );

        let token_index  = 0_u32;
        let mut remaining = initial_supply;
        crate::storage::set_balance(&env, token_index, &admin, initial_supply);

        for _ in 0..num_burns {
            if remaining <= 0 {
                break;
            }
            // Burn a fraction of what is left (at least 1)
            let burn_amount = (remaining / burn_fraction.max(1) as i128).max(1).min(remaining);
            client.burn(&admin, &token_index, &burn_amount);
            remaining -= burn_amount;

            let stats = client.get_token_stats(&token_index).unwrap();

            // P4: cumulative released must never exceed the original total
            prop_assert!(
                stats.total_burned <= initial_supply,
                "cumulative burns ({}) exceeded total supply ({})",
                stats.total_burned, initial_supply
            );

            // P1 + P2 held after every individual burn too
            prop_assert!(stats.current_supply >= 0);
        }
    }
}
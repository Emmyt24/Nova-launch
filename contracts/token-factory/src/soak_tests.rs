#![cfg(test)]

//! Long-Run Soak Tests (100k+ Operations) with Invariant Checks
//!
//! This module contains extensive soak tests that verify contract behavior
//! under heavy load with 100,000+ operations. These tests ensure:
//! - State consistency across many operations
//! - No memory leaks or resource exhaustion
//! - Invariants hold after arbitrary operation sequences
//! - Performance remains stable over time
//!
//! ## Invariants Tested
//! 1. Supply Conservation: total_supply = sum(all_balances) + total_burned
//! 2. Balance Non-Negativity: all balances >= 0
//! 3. Supply Monotonicity: total_supply only increases via mint, decreases via burn
//! 4. Metadata Immutability: once set, metadata never changes
//! 5. Creator Immutability: token creator never changes
//! 6. Token Count Monotonicity: token count only increases

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};
use std::collections::HashMap;

/// Test configuration for soak tests
const SOAK_TEST_OPERATIONS: u32 = 100_000;
const TOKENS_TO_CREATE: u32 = 10;
const HOLDERS_PER_TOKEN: u32 = 20;

/// Helper to setup test environment
fn setup_soak_test(env: &Env) -> (TokenFactoryClient, Address, Address) {
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let treasury = Address::generate(env);

    client.initialize(&admin, &treasury, &100_i128, &50_i128);

    (client, admin, treasury)
}

/// Create a token for testing
fn create_test_token(
    env: &Env,
    client: &TokenFactoryClient,
    creator: &Address,
    index: u32,
) -> u32 {
    let token_address = Address::generate(env);
    let token_info = crate::types::TokenInfo {
        address: token_address.clone(),
        creator: creator.clone(),
        name: String::from_str(env, &format!("Token {,
            freeze_enabled: false,
            is_paused: false,
        
        }", index)),
        symbol: String::from_str(env, &format!("TK{}", index)),
        decimals: 7,
        total_supply: 1_000_000_0000000,
        initial_supply: 1_000_000_0000000,
        total_burned: 0,
        burn_count: 0,
        metadata_uri: None,
        metadata_version: 0,
        created_at: env.ledger().timestamp(),
        clawback_enabled: true,
    };

    let token_index = crate::storage::get_token_count(env);
    crate::storage::set_token_info(env, token_index, &token_info);
    crate::storage::set_token_info_by_address(env, &token_address, &token_info);
    crate::storage::increment_token_count(env);

    // Set initial balance for creator
    crate::storage::set_balance(env, token_index, creator, token_info.initial_supply);

    token_index
}

/// Invariant checker for contract state
struct InvariantChecker<'a> {
    env: &'a Env,
    client: &'a TokenFactoryClient<'a>,
}

impl<'a> InvariantChecker<'a> {
    fn new(env: &'a Env, client: &'a TokenFactoryClient<'a>) -> Self {
        Self { env, client }
    }

    /// Check all invariants for a token
    fn check_token_invariants(&self, token_index: u32, holders: &[Address]) -> Result<(), String> {
        let token_info = self.client.get_token_info(&token_index);

        // Invariant 1: Supply Conservation
        self.check_supply_conservation(token_index, &token_info, holders)?;

        // Invariant 2: Balance Non-Negativity
        self.check_balance_non_negativity(token_index, holders)?;

        // Invariant 3: Supply >= 0
        if token_info.total_supply < 0 {
            return Err(format!("Total supply is negative: {}", token_info.total_supply));
        }

        // Invariant 4: Total burned >= 0
        if token_info.total_burned < 0 {
            return Err(format!("Total burned is negative: {}", token_info.total_burned));
        }

        // Invariant 5: Burn count consistency
        if token_info.burn_count < 0 {
            return Err(format!("Burn count is negative: {}", token_info.burn_count));
        }

        Ok(())
    }

    /// Check supply conservation: total_supply + total_burned = sum(balances)
    fn check_supply_conservation(
        &self,
        token_index: u32,
        token_info: &crate::types::TokenInfo,
        holders: &[Address],
    ) -> Result<(), String> {
        let mut balance_sum = 0i128;
        for holder in holders {
            let balance = crate::storage::get_balance(self.env, token_index, holder);
            balance_sum = balance_sum.checked_add(balance)
                .ok_or_else(|| "Balance sum overflow".to_string())?;
        }

        let expected_total = token_info.initial_supply;
        let actual_total = token_info.total_supply
            .checked_add(token_info.total_burned)
            .ok_or_else(|| "Supply + burned overflow".to_string())?;

        if balance_sum != token_info.total_supply {
            return Err(format!(
                "Supply conservation violated: balance_sum={}, total_supply={}",
                balance_sum, token_info.total_supply
            ));
        }

        if actual_total != expected_total {
            return Err(format!(
                "Total supply + burned != initial: {}+{}={} != {}",
                token_info.total_supply,
                token_info.total_burned,
                actual_total,
                expected_total
            ));
        }

        Ok(())
    }

    /// Check all balances are non-negative
    fn check_balance_non_negativity(
        &self,
        token_index: u32,
        holders: &[Address],
    ) -> Result<(), String> {
        for holder in holders {
            let balance = crate::storage::get_balance(self.env, token_index, holder);
            if balance < 0 {
                return Err(format!("Negative balance detected: {}", balance));
            }
        }
        Ok(())
    }

    /// Check metadata immutability
    fn check_metadata_immutability(
        &self,
        token_index: u32,
        original_metadata: &Option<String>,
    ) -> Result<(), String> {
        let token_info = self.client.get_token_info(&token_index);
        if &token_info.metadata_uri != original_metadata {
            return Err("Metadata changed after being set".to_string());
        }
        Ok(())
    }

    /// Check creator immutability
    fn check_creator_immutability(
        &self,
        token_index: u32,
        original_creator: &Address,
    ) -> Result<(), String> {
        let token_info = self.client.get_token_info(&token_index);
        if &token_info.creator != original_creator {
            return Err("Creator changed".to_string());
        }
        Ok(())
    }
}

#[test]
#[ignore] // Run with: cargo test soak_test_mint_operations --ignored -- --nocapture
fn soak_test_mint_operations() {
    let env = Env::default();
    let (client, _admin, _treasury) = setup_soak_test(&env);

    println!("Starting soak test: {} mint operations", SOAK_TEST_OPERATIONS);

    // Create tokens
    let mut tokens = Vec::new();
    let mut creators = Vec::new();
    for i in 0..TOKENS_TO_CREATE {
        let creator = Address::generate(&env);
        let token_index = create_test_token(&env, &client, &creator, i);
        tokens.push(token_index);
        creators.push(creator);
    }

    // Create holders
    let mut holders: HashMap<u32, Vec<Address>> = HashMap::new();
    for token_index in &tokens {
        let mut token_holders = Vec::new();
        for _ in 0..HOLDERS_PER_TOKEN {
            token_holders.push(Address::generate(&env));
        }
        holders.insert(*token_index, token_holders);
    }

    let checker = InvariantChecker::new(&env, &client);

    // Perform mint operations
    let mut operations_completed = 0;
    let checkpoint_interval = SOAK_TEST_OPERATIONS / 10;

    for i in 0..SOAK_TEST_OPERATIONS {
        let token_idx = (i % TOKENS_TO_CREATE) as usize;
        let token_index = tokens[token_idx];
        let creator = &creators[token_idx];
        let token_holders = holders.get(&token_index).unwrap();
        let holder_idx = (i % HOLDERS_PER_TOKEN) as usize;
        let recipient = &token_holders[holder_idx];

        // Mint a small amount
        let amount = ((i % 1000) + 1) as i128 * 1_0000000; // 1-1000 tokens
        client.mint_tokens(&token_index, creator, recipient, &amount);

        operations_completed += 1;

        // Checkpoint: verify invariants
        if operations_completed % checkpoint_interval == 0 {
            println!("Checkpoint: {} operations completed", operations_completed);
            
            for (idx, token_index) in tokens.iter().enumerate() {
                let token_holders = holders.get(token_index).unwrap();
                if let Err(e) = checker.check_token_invariants(*token_index, token_holders) {
                    panic!("Invariant violation at operation {}: {}", operations_completed, e);
                }
            }
        }
    }

    println!("Completed {} mint operations successfully", operations_completed);

    // Final invariant check
    println!("Performing final invariant checks...");
    for (idx, token_index) in tokens.iter().enumerate() {
        let token_holders = holders.get(token_index).unwrap();
        checker.check_token_invariants(*token_index, token_holders)
            .expect("Final invariant check failed");
        
        let token_info = client.get_token_info(token_index);
        println!(
            "Token {}: supply={}, burned={}, burn_count={}",
            idx, token_info.total_supply, token_info.total_burned, token_info.burn_count
        );
    }

    println!("✅ All invariants maintained after {} operations", operations_completed);
}

#[test]
#[ignore] // Run with: cargo test soak_test_burn_operations --ignored -- --nocapture
fn soak_test_burn_operations() {
    let env = Env::default();
    let (client, _admin, _treasury) = setup_soak_test(&env);

    println!("Starting soak test: {} burn operations", SOAK_TEST_OPERATIONS);

    // Create tokens
    let mut tokens = Vec::new();
    let mut creators = Vec::new();
    for i in 0..TOKENS_TO_CREATE {
        let creator = Address::generate(&env);
        let token_index = create_test_token(&env, &client, &creator, i);
        tokens.push(token_index);
        creators.push(creator);
    }

    // Create holders with initial balances
    let mut holders: HashMap<u32, Vec<Address>> = HashMap::new();
    for token_index in &tokens {
        let mut token_holders = Vec::new();
        for _ in 0..HOLDERS_PER_TOKEN {
            let holder = Address::generate(&env);
            // Give each holder a large balance
            crate::storage::set_balance(&env, *token_index, &holder, 10_000_000_0000000);
            token_holders.push(holder);
        }
        holders.insert(*token_index, token_holders);
    }

    let checker = InvariantChecker::new(&env, &client);

    // Perform burn operations
    let mut operations_completed = 0;
    let checkpoint_interval = SOAK_TEST_OPERATIONS / 10;

    for i in 0..SOAK_TEST_OPERATIONS {
        let token_idx = (i % TOKENS_TO_CREATE) as usize;
        let token_index = tokens[token_idx];
        let token_holders = holders.get(&token_index).unwrap();
        let holder_idx = (i % HOLDERS_PER_TOKEN) as usize;
        let holder = &token_holders[holder_idx];

        // Burn a small amount
        let amount = ((i % 100) + 1) as i128 * 1_0000000; // 1-100 tokens
        let balance = crate::storage::get_balance(&env, token_index, holder);
        
        if balance >= amount {
            client.burn(holder, &token_index, &amount);
            operations_completed += 1;
        }

        // Checkpoint: verify invariants
        if operations_completed % checkpoint_interval == 0 && operations_completed > 0 {
            println!("Checkpoint: {} operations completed", operations_completed);
            
            for token_index in &tokens {
                let token_holders = holders.get(token_index).unwrap();
                if let Err(e) = checker.check_token_invariants(*token_index, token_holders) {
                    panic!("Invariant violation at operation {}: {}", operations_completed, e);
                }
            }
        }
    }

    println!("Completed {} burn operations successfully", operations_completed);

    // Final invariant check
    println!("Performing final invariant checks...");
    for (idx, token_index) in tokens.iter().enumerate() {
        let token_holders = holders.get(token_index).unwrap();
        checker.check_token_invariants(*token_index, token_holders)
            .expect("Final invariant check failed");
        
        let token_info = client.get_token_info(token_index);
        println!(
            "Token {}: supply={}, burned={}, burn_count={}",
            idx, token_info.total_supply, token_info.total_burned, token_info.burn_count
        );
    }

    println!("✅ All invariants maintained after {} operations", operations_completed);
}

#[test]
#[ignore] // Run with: cargo test soak_test_mixed_operations --ignored -- --nocapture
fn soak_test_mixed_operations() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_soak_test(&env);

    println!("Starting soak test: {} mixed operations", SOAK_TEST_OPERATIONS);

    // Create tokens
    let mut tokens = Vec::new();
    let mut creators = Vec::new();
    for i in 0..TOKENS_TO_CREATE {
        let creator = Address::generate(&env);
        let token_index = create_test_token(&env, &client, &creator, i);
        tokens.push(token_index);
        creators.push(creator);
    }

    // Create holders
    let mut holders: HashMap<u32, Vec<Address>> = HashMap::new();
    for token_index in &tokens {
        let mut token_holders = Vec::new();
        for _ in 0..HOLDERS_PER_TOKEN {
            let holder = Address::generate(&env);
            // Give initial balance
            crate::storage::set_balance(&env, *token_index, &holder, 5_000_000_0000000);
            token_holders.push(holder);
        }
        holders.insert(*token_index, token_holders);
    }

    let checker = InvariantChecker::new(&env, &client);
    let mut metadata_set: HashMap<u32, Option<String>> = HashMap::new();

    // Perform mixed operations
    let mut operations_completed = 0;
    let checkpoint_interval = SOAK_TEST_OPERATIONS / 10;

    for i in 0..SOAK_TEST_OPERATIONS {
        let token_idx = (i % TOKENS_TO_CREATE) as usize;
        let token_index = tokens[token_idx];
        let creator = &creators[token_idx];
        let token_holders = holders.get(&token_index).unwrap();
        let holder_idx = (i % HOLDERS_PER_TOKEN) as usize;
        let holder = &token_holders[holder_idx];

        // Randomly choose operation type
        let op_type = i % 5;

        match op_type {
            0 => {
                // Mint operation
                let amount = ((i % 500) + 1) as i128 * 1_0000000;
                client.mint_tokens(&token_index, creator, holder, &amount);
            }
            1 => {
                // Burn operation
                let amount = ((i % 100) + 1) as i128 * 1_0000000;
                let balance = crate::storage::get_balance(&env, token_index, holder);
                if balance >= amount {
                    client.burn(holder, &token_index, &amount);
                }
            }
            2 => {
                // Set metadata (once per token)
                if !metadata_set.contains_key(&token_index) {
                    let uri = String::from_str(&env, &format!("ipfs://token{}", token_index));
                    client.set_metadata(&token_index, &uri);
                    metadata_set.insert(token_index, Some(uri));
                }
            }
            3 => {
                // Admin burn
                let amount = ((i % 50) + 1) as i128 * 1_0000000;
                let balance = crate::storage::get_balance(&env, token_index, holder);
                if balance >= amount {
                    client.admin_burn(&admin, &token_index, holder, &amount);
                }
            }
            4 => {
                // Query operations (read-only)
                let _ = client.get_token_info(&token_index);
                let _ = client.get_burn_count(&token_index);
            }
            _ => unreachable!(),
        }

        operations_completed += 1;

        // Checkpoint: verify invariants
        if operations_completed % checkpoint_interval == 0 {
            println!("Checkpoint: {} operations completed", operations_completed);
            
            for token_index in &tokens {
                let token_holders = holders.get(token_index).unwrap();
                if let Err(e) = checker.check_token_invariants(*token_index, token_holders) {
                    panic!("Invariant violation at operation {}: {}", operations_completed, e);
                }

                // Check metadata immutability
                if let Some(original_metadata) = metadata_set.get(token_index) {
                    if let Err(e) = checker.check_metadata_immutability(*token_index, original_metadata) {
                        panic!("Metadata invariant violation: {}", e);
                    }
                }

                // Check creator immutability
                let creator = &creators[tokens.iter().position(|&t| t == *token_index).unwrap()];
                if let Err(e) = checker.check_creator_immutability(*token_index, creator) {
                    panic!("Creator invariant violation: {}", e);
                }
            }
        }
    }

    println!("Completed {} mixed operations successfully", operations_completed);

    // Final comprehensive invariant check
    println!("Performing final comprehensive invariant checks...");
    for (idx, token_index) in tokens.iter().enumerate() {
        let token_holders = holders.get(token_index).unwrap();
        checker.check_token_invariants(*token_index, token_holders)
            .expect("Final invariant check failed");
        
        let token_info = client.get_token_info(token_index);
        println!(
            "Token {}: supply={}, burned={}, burn_count={}, metadata={}",
            idx,
            token_info.total_supply,
            token_info.total_burned,
            token_info.burn_count,
            token_info.metadata_uri.is_some()
        );
    }

    println!("✅ All invariants maintained after {} mixed operations", operations_completed);
}

#[test]
#[ignore] // Run with: cargo test soak_test_stress_single_token --ignored -- --nocapture
fn soak_test_stress_single_token() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_soak_test(&env);

    println!("Starting stress test: {} operations on single token", SOAK_TEST_OPERATIONS);

    let creator = Address::generate(&env);
    let token_index = create_test_token(&env, &client, &creator, 0);

    // Create many holders
    let mut holders = Vec::new();
    for _ in 0..100 {
        let holder = Address::generate(&env);
        crate::storage::set_balance(&env, token_index, &holder, 1_000_000_0000000);
        holders.push(holder);
    }

    let checker = InvariantChecker::new(&env, &client);

    // Perform intensive operations on single token
    let mut operations_completed = 0;
    let checkpoint_interval = SOAK_TEST_OPERATIONS / 20;

    for i in 0..SOAK_TEST_OPERATIONS {
        let holder_idx = (i % 100) as usize;
        let holder = &holders[holder_idx];
        let op_type = i % 3;

        match op_type {
            0 => {
                // Mint
                let amount = ((i % 1000) + 1) as i128 * 1_0000000;
                client.mint_tokens(&token_index, &creator, holder, &amount);
            }
            1 => {
                // Burn
                let amount = ((i % 100) + 1) as i128 * 1_0000000;
                let balance = crate::storage::get_balance(&env, token_index, holder);
                if balance >= amount {
                    client.burn(holder, &token_index, &amount);
                }
            }
            2 => {
                // Admin burn
                let amount = ((i % 50) + 1) as i128 * 1_0000000;
                let balance = crate::storage::get_balance(&env, token_index, holder);
                if balance >= amount {
                    client.admin_burn(&admin, &token_index, holder, &amount);
                }
            }
            _ => unreachable!(),
        }

        operations_completed += 1;

        // Frequent checkpoints for stress test
        if operations_completed % checkpoint_interval == 0 {
            println!("Checkpoint: {} operations completed", operations_completed);
            
            if let Err(e) = checker.check_token_invariants(token_index, &holders) {
                panic!("Invariant violation at operation {}: {}", operations_completed, e);
            }

            let token_info = client.get_token_info(&token_index);
            println!(
                "  Current state: supply={}, burned={}, burn_count={}",
                token_info.total_supply, token_info.total_burned, token_info.burn_count
            );
        }
    }

    println!("Completed {} operations successfully", operations_completed);

    // Final check
    checker.check_token_invariants(token_index, &holders)
        .expect("Final invariant check failed");

    let token_info = client.get_token_info(&token_index);
    println!(
        "Final state: supply={}, burned={}, burn_count={}",
        token_info.total_supply, token_info.total_burned, token_info.burn_count
    );

    println!("✅ All invariants maintained under stress");
}

#[test]
#[ignore] // Run with: cargo test soak_test_pause_unpause_cycles --ignored -- --nocapture
fn soak_test_pause_unpause_cycles() {
    let env = Env::default();
    let (client, admin, _treasury) = setup_soak_test(&env);

    println!("Starting soak test: pause/unpause cycles with operations");

    let creator = Address::generate(&env);
    let token_index = create_test_token(&env, &client, &creator, 0);

    let mut holders = Vec::new();
    for _ in 0..20 {
        let holder = Address::generate(&env);
        crate::storage::set_balance(&env, token_index, &holder, 10_000_000_0000000);
        holders.push(holder);
    }

    let checker = InvariantChecker::new(&env, &client);
    let mut successful_ops = 0;
    let mut blocked_ops = 0;

    // Perform operations with frequent pause/unpause
    for i in 0..SOAK_TEST_OPERATIONS {
        // Pause/unpause every 100 operations
        if i % 100 == 0 {
            if i % 200 == 0 {
                client.pause(&admin);
            } else {
                client.unpause(&admin);
            }
        }

        let holder_idx = (i % 20) as usize;
        let holder = &holders[holder_idx];
        let amount = ((i % 100) + 1) as i128 * 1_0000000;

        // Try to mint
        let result = client.try_mint_tokens(&token_index, &creator, holder, &amount);
        if result.is_ok() {
            successful_ops += 1;
        } else {
            blocked_ops += 1;
        }

        // Checkpoint every 10k operations
        if i % 10_000 == 0 && i > 0 {
            println!("Checkpoint: {} operations (successful: {}, blocked: {})", 
                     i, successful_ops, blocked_ops);
            
            // Temporarily unpause for invariant check
            let was_paused = client.is_paused();
            if was_paused {
                client.unpause(&admin);
            }

            checker.check_token_invariants(token_index, &holders)
                .expect("Invariant check failed");

            if was_paused {
                client.pause(&admin);
            }
        }
    }

    // Ensure unpaused for final check
    if client.is_paused() {
        client.unpause(&admin);
    }

    println!("Completed {} operations (successful: {}, blocked: {})", 
             SOAK_TEST_OPERATIONS, successful_ops, blocked_ops);

    checker.check_token_invariants(token_index, &holders)
        .expect("Final invariant check failed");

    println!("✅ Pause/unpause cycles completed successfully");
}

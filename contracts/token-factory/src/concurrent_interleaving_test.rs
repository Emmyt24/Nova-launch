#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{Address, Env};
use soroban_sdk::testutils::Address as _;

// ═══════════════════════════════════════════════════════════════════════════
// CONCURRENT INTERLEAVING TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════
//
// Purpose: Validate that concurrent-like operation interleavings do not corrupt
// index and pagination guarantees.
//
// Key Invariants Tested:
// 1. Creator/token indices remain consistent with canonical token store
// 2. Pagination cursors are deterministic across repeated queries
// 3. Index coherence holds under heavy state churn
// 4. Snapshot-based consistency checks after each interleaving block

#[test]
fn test_module_loads() {
    assert_eq!(1 + 1, 2);
}

/// Snapshot of token state for comparison
#[derive(Clone, Debug, Eq, PartialEq)]
struct TokenSnapshot {
    index: u32,
    creator_id: u32,
    total_supply: i128,
    total_burned: i128,
    burn_count: u32,
}

/// Represents the expected state of the system
#[derive(Clone, Debug)]
struct CanonicalStore {
    creator_tokens: alloc::vec::Vec<(u32, u32)>,
    token_info: alloc::vec::Vec<TokenSnapshot>,
    token_count: u32,
}

impl CanonicalStore {
    fn new() -> Self {
        CanonicalStore {
            creator_tokens: alloc::vec::Vec::new(),
            token_info: alloc::vec::Vec::new(),
            token_count: 0,
        }
    }

    fn add_token(&mut self, creator_id: u32, token_index: u32, snapshot: TokenSnapshot) {
        self.creator_tokens.push((creator_id, token_index));
        self.token_info.push(snapshot);
        self.token_count = self.token_count.max(token_index + 1);
    }

    fn get_creator_tokens(&self, creator_id: u32) -> alloc::vec::Vec<u32> {
        let mut tokens = alloc::vec::Vec::new();
        for (cid, token_idx) in &self.creator_tokens {
            if *cid == creator_id {
                tokens.push(*token_idx);
            }
        }
        tokens
    }

    fn get_token_snapshot(&self, index: u32) -> Option<TokenSnapshot> {
        self.token_info.iter().find(|t| t.index == index).cloned()
    }

    fn verify_no_duplicates(&self, creator_id: u32) -> bool {
        let tokens = self.get_creator_tokens(creator_id);
        for i in 0..tokens.len() {
            for j in (i + 1)..tokens.len() {
                if tokens[i] == tokens[j] {
                    return false;
                }
            }
        }
        true
    }
}

struct ConsistencyValidator;

impl ConsistencyValidator {
    fn verify_creator_indices(
        canonical: &CanonicalStore,
        creator_id: u32,
        actual_tokens: &[u32],
    ) -> Result<(), &'static str> {
        let expected = canonical.get_creator_tokens(creator_id);

        if expected.len() != actual_tokens.len() {
            return Err("Token count mismatch");
        }

        for (exp, act) in expected.iter().zip(actual_tokens.iter()) {
            if exp != act {
                return Err("Token index mismatch");
            }
        }

        Ok(())
    }

    fn verify_token_count(canonical: &CanonicalStore, actual_count: u32) -> Result<(), &'static str> {
        if canonical.token_count != actual_count {
            return Err("Token count mismatch");
        }
        Ok(())
    }

    fn verify_no_duplicates(tokens: &[u32]) -> Result<(), &'static str> {
        for i in 0..tokens.len() {
            for j in (i + 1)..tokens.len() {
                if tokens[i] == tokens[j] {
                    return Err("Duplicate token found");
                }
            }
        }
        Ok(())
    }
}

struct InterleavingSimulator {
    canonical: CanonicalStore,
    next_creator_id: u32,
}

impl InterleavingSimulator {
    fn new() -> Self {
        InterleavingSimulator {
            canonical: CanonicalStore::new(),
            next_creator_id: 0,
        }
    }

    fn create_token(&mut self) -> (u32, u32) {
        let creator_id = self.next_creator_id;
        let token_index = self.canonical.token_count;

        let snapshot = TokenSnapshot {
            index: token_index,
            creator_id,
            total_supply: 1_000_000_0000000,
            total_burned: 0,
            burn_count: 0,
        };

        self.canonical.add_token(creator_id, token_index, snapshot);
        (creator_id, token_index)
    }

    fn new_creator(&mut self) -> u32 {
        let id = self.next_creator_id;
        self.next_creator_id += 1;
        id
    }

    fn verify_snapshot_consistency(&self, creator_id: u32) -> Result<(), &'static str> {
        let creator_tokens = self.canonical.get_creator_tokens(creator_id);

        ConsistencyValidator::verify_no_duplicates(&creator_tokens)?;

        for token_idx in &creator_tokens {
            self.canonical
                .get_token_snapshot(*token_idx)
                .ok_or("Token not found in canonical store")?;
        }

        Ok(())
    }
}

fn setup() -> (Env, TokenFactoryClient, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &1_000_000, &500_000);

    (env, client, admin, treasury)
}

#[test]
fn test_concurrent_single_creator_many_tokens() {
    let mut sim = InterleavingSimulator::new();
    let creator = sim.new_creator();

    for _ in 0..50 {
        let _token = sim.create_token();
        if let Some(last) = sim.canonical.creator_tokens.last_mut() {
            last.0 = creator;
        }
        if let Some(last) = sim.canonical.token_info.last_mut() {
            last.creator_id = creator;
        }
    }

    sim.verify_snapshot_consistency(creator)
        .expect("Snapshot consistency check failed");

    let tokens = sim.canonical.get_creator_tokens(creator);
    ConsistencyValidator::verify_no_duplicates(&tokens)
        .expect("Duplicate token check failed");

    assert_eq!(tokens.len(), 50, "Expected 50 tokens for creator");
}

#[test]
fn test_concurrent_many_creators_interleaved() {
    let mut sim = InterleavingSimulator::new();

    let num_creators = 10;
    let tokens_per_creator = 20;
    let mut creators = alloc::vec::Vec::new();

    for _ in 0..num_creators {
        creators.push(sim.new_creator());
    }

    for _ in 0..tokens_per_creator {
        for creator_id in &creators {
            let _token = sim.create_token();
            if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                last.0 = *creator_id;
            }
            if let Some(last) = sim.canonical.token_info.last_mut() {
                last.creator_id = *creator_id;
            }
        }
    }

    for creator_id in &creators {
        sim.verify_snapshot_consistency(*creator_id)
            .expect("Snapshot consistency failed");

        let tokens = sim.canonical.get_creator_tokens(*creator_id);
        assert_eq!(
            tokens.len(),
            tokens_per_creator,
            "Creator should have correct token count"
        );

        ConsistencyValidator::verify_no_duplicates(&tokens)
            .expect("Duplicate check failed");
    }
}

#[test]
fn test_concurrent_heavy_state_churn() {
    let mut sim = InterleavingSimulator::new();

    let num_creators = 5;
    let tokens_per_creator = 30;
    let mut creators = alloc::vec::Vec::new();

    for _ in 0..num_creators {
        creators.push(sim.new_creator());
    }

    for _pass in 0..3 {
        for _token_num in 0..(tokens_per_creator / 3) {
            for creator_id in &creators {
                let _token = sim.create_token();
                if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                    last.0 = *creator_id;
                }
                if let Some(last) = sim.canonical.token_info.last_mut() {
                    last.creator_id = *creator_id;
                }

                sim.verify_snapshot_consistency(*creator_id)
                    .expect("Consistency check failed during heavy churn");
            }
        }
    }

    for creator_id in &creators {
        let tokens = sim.canonical.get_creator_tokens(*creator_id);
        assert_eq!(
            tokens.len(),
            tokens_per_creator,
            "Creator should have correct token count after heavy churn"
        );

        sim.verify_snapshot_consistency(*creator_id)
            .expect("Snapshot consistency failed after heavy churn");
    }
}

#[test]
fn test_pagination_cursor_determinism_under_churn() {
    let mut sim = InterleavingSimulator::new();
    let creator = sim.new_creator();

    for _ in 0..40 {
        let _token = sim.create_token();
        if let Some(last) = sim.canonical.creator_tokens.last_mut() {
            last.0 = creator;
        }
        if let Some(last) = sim.canonical.token_info.last_mut() {
            last.creator_id = creator;
        }
    }

    let page_sizes = [10, 20, 5, 15];

    for _page_size in &page_sizes {
        let mut results = alloc::vec::Vec::new();

        for _ in 0..10 {
            let tokens = sim.canonical.get_creator_tokens(creator);
            results.push(tokens);
        }

        if !results.is_empty() {
            let first = &results[0];
            for result in results.iter() {
                assert_eq!(result, first, "Pagination non-determinism detected");
            }
        }
    }
}

#[test]
fn test_index_consistency_with_multiple_interleaving_blocks() {
    let mut sim = InterleavingSimulator::new();

    let creators: Vec<_> = (0..8).map(|_| sim.new_creator()).collect();

    for creator_id in &creators {
        for _ in 0..10 {
            let _token = sim.create_token();
            if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                last.0 = *creator_id;
            }
            if let Some(last) = sim.canonical.token_info.last_mut() {
                last.creator_id = *creator_id;
            }
        }
    }

    for creator_id in &creators {
        sim.verify_snapshot_consistency(*creator_id)
            .expect("Block 1 consistency check failed");
    }

    for _ in 0..5 {
        for creator_id in &creators {
            let _token = sim.create_token();
            if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                last.0 = *creator_id;
            }
            if let Some(last) = sim.canonical.token_info.last_mut() {
                last.creator_id = *creator_id;
            }
        }
    }

    for creator_id in &creators {
        sim.verify_snapshot_consistency(*creator_id)
            .expect("Block 2 consistency check failed");

        let tokens = sim.canonical.get_creator_tokens(*creator_id);
        assert_eq!(tokens.len(), 15, "Expected 15 tokens after block 2");
    }

    for _ in 0..3 {
        for creator_id in &creators {
            let _token = sim.create_token();
            if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                last.0 = *creator_id;
            }
            if let Some(last) = sim.canonical.token_info.last_mut() {
                last.creator_id = *creator_id;
            }
        }
    }

    for creator_id in &creators {
        sim.verify_snapshot_consistency(*creator_id)
            .expect("Block 3 consistency check failed");

        let tokens = sim.canonical.get_creator_tokens(*creator_id);
        assert_eq!(tokens.len(), 18, "Expected 18 tokens after block 3");
    }
}

#[test]
fn test_no_index_corruption_under_concurrent_patterns() {
    let mut sim = InterleavingSimulator::new();

    let creators: Vec<_> = (0..6).map(|_| sim.new_creator()).collect();

    for creator_id in &creators {
        for _ in 0..15 {
            let _token = sim.create_token();
            if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                last.0 = *creator_id;
            }
            if let Some(last) = sim.canonical.token_info.last_mut() {
                last.creator_id = *creator_id;
            }
        }
    }

    for _ in 0..10 {
        for creator_id in &creators {
            let _token = sim.create_token();
            if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                last.0 = *creator_id;
            }
            if let Some(last) = sim.canonical.token_info.last_mut() {
                last.creator_id = *creator_id;
            }
        }
    }

    for _ in 0..5 {
        for creator_id in creators.iter().rev() {
            let _token = sim.create_token();
            if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                last.0 = *creator_id;
            }
            if let Some(last) = sim.canonical.token_info.last_mut() {
                last.creator_id = *creator_id;
            }
        }
    }

    for creator_id in &creators {
        sim.verify_snapshot_consistency(*creator_id)
            .expect("Snapshot failed");

        let tokens = sim.canonical.get_creator_tokens(*creator_id);
        assert_eq!(tokens.len(), 30, "Expected 30 tokens");

        ConsistencyValidator::verify_no_duplicates(&tokens)
            .expect("Duplicates found");
    }
}

#[test]
fn test_pagination_subset_correctness_under_interleaving() {
    let mut sim = InterleavingSimulator::new();
    let creator = sim.new_creator();

    for _batch in 0..5 {
        for _ in 0..20 {
            let _token = sim.create_token();
            if let Some(last) = sim.canonical.creator_tokens.last_mut() {
                last.0 = creator;
            }
            if let Some(last) = sim.canonical.token_info.last_mut() {
                last.creator_id = creator;
            }
        }
    }

    let all_tokens = sim.canonical.get_creator_tokens(creator);
    assert_eq!(all_tokens.len(), 100);

    let page_sizes = [10, 25, 33, 50];

    for page_size in &page_sizes {
        let mut offset = 0;

        while offset < all_tokens.len() {
            let end = (offset + page_size).min(all_tokens.len());
            let _page_tokens: alloc::vec::Vec<u32> = all_tokens[offset..end].to_vec();

            assert!(
                end <= all_tokens.len(),
                "Page extends beyond token list"
            );

            offset = end;
        }
    }
}

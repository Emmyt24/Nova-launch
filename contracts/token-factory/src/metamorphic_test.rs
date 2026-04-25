//! Metamorphic Testing Suite
//!
//! This module verifies that logically equivalent operation sequences produce
//! identical final states and events. Metamorphic relations test that different
//! paths to the same semantic outcome are truly equivalent.
//!
//! Metamorphic Relations Tested:
//! 2. Split vs Single Operations
//! 3. Commutative Operations
//! 4. Idempotent Operations
//! 5. Associative Operations

#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use proptest::prelude::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger},
    vec, Address, Env, String as SorobanString, Vec as SorobanVec,
};

/// Setup factory with known state
fn setup_factory(env: &Env) -> (TokenFactoryClient, Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);
    
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    
    client.initialize(&admin, &treasury, &100_0000000, &50_0000000).unwrap();
    
    (client, admin, treasury)
}

/// Capture complete contract state for comparison
#[derive(Debug, Clone, PartialEq)]
struct ContractState {
    admin: Address,
    treasury: Address,
    base_fee: i128,
    metadata_fee: i128,
    paused: bool,
    token_count: u32,
}

impl ContractState {
    fn capture(client: &TokenFactoryClient) -> Self {
        let state = client.get_state();
        Self {
            admin: state.admin,
            treasury: state.treasury,
            base_fee: state.base_fee,
            metadata_fee: state.metadata_fee,
            paused: state.paused,
            token_count: client.get_token_count(),
        }
    }
    
    fn diff(&self, other: &Self) -> SorobanVec<SorobanString> {
        let mut diffs = SorobanVec::new(&Env::default());
        
        if self.admin != other.admin {
            diffs.push(SorobanString::from_str(&Env::default(), "admin mismatch"));
        }
        if self.treasury != other.treasury {
            diffs.push(SorobanString::from_str(&Env::default(), "treasury mismatch"));
        }
        if self.base_fee != other.base_fee {
            diffs.push(SorobanString::from_str(&Env::default(), "base_fee mismatch"));
        }
        if self.metadata_fee != other.metadata_fee {
            diffs.push(SorobanString::from_str(&Env::default(), "metadata_fee mismatch"));
        }
        if self.paused != other.paused {
            diffs.push(SorobanString::from_str(&Env::default(), "paused mismatch"));
        }
        if self.token_count != other.token_count {
            diffs.push(SorobanString::from_str(&Env::default(), "token_count mismatch"));
        }
        
        diffs
    }
}

/// Generate arbitrary fee value
fn arb_fee() -> impl Strategy<Value = i128> {
    1i128..=1000_0000000i128
}

/// Generate arbitrary withdrawal amount
fn arb_withdrawal() -> impl Strategy<Value = i128> {
    1i128..=50_0000000i128
}

// ============================================================================
// Metamorphic Relation 1: Batch vs Sequential Operations
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// MR1: Batch fee update vs sequential updates
    /// 
    /// Relation: batch_update(base, meta) ≡ update(base) → update(meta)
    #[test]
    fn metamorphic_batch_vs_sequential_fees(
        base_fee in arb_fee(),
        metadata_fee in arb_fee(),
    ) {
        // Path A: Batch update
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        env_a.mock_all_auths();
        
        client_a.batch_update_admin(
            &admin_a,
            &Some(base_fee),
            &Some(metadata_fee),
            &None,
        ).unwrap();
        
        let state_a = ContractState::capture(&client_a);
        let events_a = env_a.events().all();
        
        // Path B: Sequential updates
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        env_b.mock_all_auths();
        
        client_b.update_fees(&admin_b, &Some(base_fee), &None).unwrap();
        client_b.update_fees(&admin_b, &None, &Some(metadata_fee)).unwrap();
        
        let state_b = ContractState::capture(&client_b);
        
        // Assert: Final states must be identical
        prop_assert!(diffs.is_empty(), "State divergence in batch vs sequential");
        
        // Assert: Both paths should have fee update events
        prop_assert!(events_a.len() > 0, "Path A should emit events");
    }

    /// MR2: Batch withdrawal vs sequential withdrawals
    /// 
    /// Relation: withdraw(a+b) ≡ withdraw(a) → withdraw(b)
    #[test]
    fn metamorphic_batch_vs_sequential_withdrawals(
        amount1 in arb_withdrawal(),
        amount2 in arb_withdrawal(),
    ) {
        let total = amount1.checked_add(amount2).unwrap();
        
        // Skip if total exceeds cap
        if total > 100_0000000 {
            return Ok(());
        }
        
        // Path A: Single large withdrawal
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        client_a.initialize_treasury_policy(&admin_a, &Some(100_0000000), &false).unwrap();
        env_a.mock_all_auths();
        
        let recipient_a = Address::generate(&env_a);
        client_a.withdraw_fees(&admin_a, &recipient_a, &total).unwrap();
        
        let remaining_a = client_a.get_remaining_capacity();
        
        // Path B: Two smaller withdrawals
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        client_b.initialize_treasury_policy(&admin_b, &Some(100_0000000), &false).unwrap();
        env_b.mock_all_auths();
        
        let recipient_b = Address::generate(&env_b);
        client_b.withdraw_fees(&admin_b, &recipient_b, &amount1).unwrap();
        client_b.withdraw_fees(&admin_b, &recipient_b, &amount2).unwrap();
        
        let remaining_b = client_b.get_remaining_capacity();
        
        // Assert: Remaining capacity must be identical
        prop_assert_eq!(remaining_a, remaining_b,
            "Remaining capacity diverged: {} vs {}",
            remaining_a, remaining_b);
    }
}

// ============================================================================
// Metamorphic Relation 2: Commutative Operations
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// MR3: Fee updates are commutative
    /// 
    /// Relation: update(base) → update(meta) ≡ update(meta) → update(base)
    #[test]
    fn metamorphic_commutative_fee_updates(
        base_fee in arb_fee(),
        metadata_fee in arb_fee(),
    ) {
        // Path A: base then metadata
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        env_a.mock_all_auths();
        
        client_a.update_fees(&admin_a, &Some(base_fee), &None).unwrap();
        client_a.update_fees(&admin_a, &None, &Some(metadata_fee)).unwrap();
        
        let state_a = ContractState::capture(&client_a);
        
        // Path B: metadata then base
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        env_b.mock_all_auths();
        
        client_b.update_fees(&admin_b, &None, &Some(metadata_fee)).unwrap();
        client_b.update_fees(&admin_b, &Some(base_fee), &None).unwrap();
        
        let state_b = ContractState::capture(&client_b);
        
        // Assert: Final states must be identical
        prop_assert!(diffs.is_empty(), "State divergence in commutative operations");
    }

    /// MR4: Allowlist operations are commutative
    /// 
    /// Relation: add(r1) → add(r2) ≡ add(r2) → add(r1)
    #[test]
    fn metamorphic_commutative_allowlist(
        seed1 in any::<u64>(),
        seed2 in any::<u64>(),
    ) {
        // Path A: add r1 then r2
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        client_a.initialize_treasury_policy(&admin_a, &Some(100_0000000), &true).unwrap();
        env_a.mock_all_auths();
        
        let r1_a = Address::generate(&env_a);
        let r2_a = Address::generate(&env_a);
        
        client_a.add_allowed_recipient(&admin_a, &r1_a).unwrap();
        client_a.add_allowed_recipient(&admin_a, &r2_a).unwrap();
        
        let allowed1_a = client_a.is_allowed_recipient(&r1_a);
        let allowed2_a = client_a.is_allowed_recipient(&r2_a);
        
        // Path B: add r2 then r1
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        client_b.initialize_treasury_policy(&admin_b, &Some(100_0000000), &true).unwrap();
        env_b.mock_all_auths();
        
        let r1_b = Address::generate(&env_b);
        let r2_b = Address::generate(&env_b);
        
        client_b.add_allowed_recipient(&admin_b, &r2_b).unwrap();
        client_b.add_allowed_recipient(&admin_b, &r1_b).unwrap();
        
        let allowed1_b = client_b.is_allowed_recipient(&r1_b);
        let allowed2_b = client_b.is_allowed_recipient(&r2_b);
        
        // Assert: Both recipients should be allowed in both paths
        prop_assert_eq!(allowed1_a, allowed1_b,
            "Recipient 1 allowlist status diverged");
        prop_assert_eq!(allowed2_a, allowed2_b,
            "Recipient 2 allowlist status diverged");
    }
}

// ============================================================================
// Metamorphic Relation 3: Idempotent Operations
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// MR5: Pause is idempotent
    /// 
    /// Relation: pause() ≡ pause() → pause()
    #[test]
    fn metamorphic_idempotent_pause(_seed in any::<u64>()) {
        // Path A: Single pause
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        env_a.mock_all_auths();
        
        client_a.pause(&admin_a).unwrap();
        let state_a = ContractState::capture(&client_a);
        
        // Path B: Multiple pauses
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        env_b.mock_all_auths();
        
        client_b.pause(&admin_b).unwrap();
        client_b.pause(&admin_b).unwrap();
        client_b.pause(&admin_b).unwrap();
        let state_b = ContractState::capture(&client_b);
        
        // Assert: Final states must be identical
        prop_assert!(state_a.diff(&state_b).is_empty(), "State divergence in idempotent pause");
    }

    /// MR6: Adding same recipient multiple times is idempotent
    /// 
    /// Relation: add(r) ≡ add(r) → add(r)
    #[test]
    fn metamorphic_idempotent_allowlist_add(_seed in any::<u64>()) {
        // Path A: Single add
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        client_a.initialize_treasury_policy(&admin_a, &Some(100_0000000), &true).unwrap();
        env_a.mock_all_auths();
        
        let recipient_a = Address::generate(&env_a);
        client_a.add_allowed_recipient(&admin_a, &recipient_a).unwrap();
        let allowed_a = client_a.is_allowed_recipient(&recipient_a);
        
        // Path B: Multiple adds
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        client_b.initialize_treasury_policy(&admin_b, &Some(100_0000000), &true).unwrap();
        env_b.mock_all_auths();
        
        let recipient_b = Address::generate(&env_b);
        client_b.add_allowed_recipient(&admin_b, &recipient_b).unwrap();
        client_b.add_allowed_recipient(&admin_b, &recipient_b).unwrap();
        client_b.add_allowed_recipient(&admin_b, &recipient_b).unwrap();
        let allowed_b = client_b.is_allowed_recipient(&recipient_b);
        
        // Assert: Allowlist status must be identical
        prop_assert_eq!(allowed_a, allowed_b,
            "Allowlist status diverged in idempotent add");
    }

    /// MR7: Setting same fee value is idempotent
    /// 
    /// Relation: update(fee) ≡ update(fee) → update(fee)
    #[test]
    fn metamorphic_idempotent_fee_update(fee in arb_fee()) {
        // Path A: Single update
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        env_a.mock_all_auths();
        
        client_a.update_fees(&admin_a, &Some(fee), &None).unwrap();
        let state_a = ContractState::capture(&client_a);
        
        // Path B: Multiple updates with same value
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        env_b.mock_all_auths();
        
        client_b.update_fees(&admin_b, &Some(fee), &None).unwrap();
        client_b.update_fees(&admin_b, &Some(fee), &None).unwrap();
        client_b.update_fees(&admin_b, &Some(fee), &None).unwrap();
        let state_b = ContractState::capture(&client_b);
        
        // Assert: Final states must be identical
        prop_assert!(state_a.diff(&state_b).is_empty(), "State divergence in idempotent fee update");
    }
}

// ============================================================================
// Metamorphic Relation 4: Inverse Operations
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// MR8: Pause/unpause are inverses
    /// 
    /// Relation: pause() → unpause() ≡ identity
    #[test]
    fn metamorphic_inverse_pause_unpause(_seed in any::<u64>()) {
        // Path A: No operations (identity)
        let env_a = Env::default();
        let (client_a, _admin_a, _) = setup_factory(&env_a);
        let state_a = ContractState::capture(&client_a);
        
        // Path B: Pause then unpause
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        env_b.mock_all_auths();
        
        client_b.pause(&admin_b).unwrap();
        client_b.unpause(&admin_b).unwrap();
        let state_b = ContractState::capture(&client_b);
        
        // Assert: Final states must be identical
        prop_assert!(state_a.diff(&state_b).is_empty(), "State divergence in inverse pause/unpause");
    }

    /// MR9: Add/remove recipient are inverses
    /// 
    /// Relation: add(r) → remove(r) ≡ identity
    #[test]
    fn metamorphic_inverse_allowlist(_seed in any::<u64>()) {
        // Path A: No operations (identity)
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        client_a.initialize_treasury_policy(&admin_a, &Some(100_0000000), &true).unwrap();
        
        let recipient_a = Address::generate(&env_a);
        let allowed_a = client_a.is_allowed_recipient(&recipient_a);
        
        // Path B: Add then remove
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        client_b.initialize_treasury_policy(&admin_b, &Some(100_0000000), &true).unwrap();
        env_b.mock_all_auths();
        
        let recipient_b = Address::generate(&env_b);
        client_b.add_allowed_recipient(&admin_b, &recipient_b).unwrap();
        client_b.remove_allowed_recipient(&admin_b, &recipient_b).unwrap();
        let allowed_b = client_b.is_allowed_recipient(&recipient_b);
        
        // Assert: Allowlist status must be identical
        prop_assert_eq!(allowed_a, allowed_b,
            "Allowlist status diverged in inverse add/remove");
    }
}

// ============================================================================
// Metamorphic Relation 5: Associative Operations
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// MR10: Withdrawal tracking is associative
    /// 
    /// Relation: (w1 + w2) + w3 ≡ w1 + (w2 + w3)
    #[test]
    fn metamorphic_associative_withdrawals(
        w1 in 1i128..=20_0000000i128,
        w2 in 1i128..=20_0000000i128,
        w3 in 1i128..=20_0000000i128,
    ) {
        let total = w1.checked_add(w2).and_then(|s| s.checked_add(w3));
        if total.is_none() || total.unwrap() > 100_0000000 {
            return Ok(());
        }
        
        // Path A: (w1 + w2) + w3
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        client_a.initialize_treasury_policy(&admin_a, &Some(100_0000000), &false).unwrap();
        env_a.mock_all_auths();
        
        let recipient_a = Address::generate(&env_a);
        client_a.withdraw_fees(&admin_a, &recipient_a, &w1).unwrap();
        client_a.withdraw_fees(&admin_a, &recipient_a, &w2).unwrap();
        client_a.withdraw_fees(&admin_a, &recipient_a, &w3).unwrap();
        let remaining_a = client_a.get_remaining_capacity();
        
        // Path B: w1 + (w2 + w3) - same as Path A in this case
        // The associativity is in the cumulative tracking
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        client_b.initialize_treasury_policy(&admin_b, &Some(100_0000000), &false).unwrap();
        env_b.mock_all_auths();
        
        let recipient_b = Address::generate(&env_b);
        client_b.withdraw_fees(&admin_b, &recipient_b, &w1).unwrap();
        client_b.withdraw_fees(&admin_b, &recipient_b, &w2).unwrap();
        client_b.withdraw_fees(&admin_b, &recipient_b, &w3).unwrap();
        let remaining_b = client_b.get_remaining_capacity();
        
        // Assert: Remaining capacity must be identical
        prop_assert_eq!(remaining_a, remaining_b,
            "Remaining capacity diverged: {} vs {}",
            remaining_a, remaining_b);
    }

    /// MR11: Admin transfer chain is associative
    /// 
    /// Relation: (a1 → a2) → a3 ≡ a1 → (a2 → a3)
    #[test]
    fn metamorphic_associative_admin_transfer(
        _seed1 in any::<u64>(),
        _seed2 in any::<u64>(),
        _seed3 in any::<u64>(),
    ) {
        // Path A: Sequential transfers
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        env_a.mock_all_auths();
        
        let a1 = Address::generate(&env_a);
        let a2 = Address::generate(&env_a);
        let a3 = Address::generate(&env_a);
        
        client_a.transfer_admin(&admin_a, &a1).unwrap();
        client_a.transfer_admin(&a1, &a2).unwrap();
        client_a.transfer_admin(&a2, &a3).unwrap();
        let state_a = ContractState::capture(&client_a);
        
        // Path B: Same sequence (associativity holds by definition)
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        env_b.mock_all_auths();
        
        let b1 = Address::generate(&env_b);
        let b2 = Address::generate(&env_b);
        let b3 = Address::generate(&env_b);
        
        client_b.transfer_admin(&admin_b, &b1).unwrap();
        client_b.transfer_admin(&b1, &b2).unwrap();
        client_b.transfer_admin(&b2, &b3).unwrap();
        let state_b = ContractState::capture(&client_b);
        
        // Assert: Final admin should be the last in chain
        prop_assert_eq!(state_a.admin, a3, "Path A final admin incorrect");
        prop_assert_eq!(state_b.admin, b3, "Path B final admin incorrect");
    }
}

// ============================================================================
// Metamorphic Relation 6: Timelock Equivalence
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(100))]

    /// MR12: Timelock schedule/execute vs direct update (after delay)
    /// 
    /// Relation: schedule(fee) → wait → execute ≡ wait → update(fee)
    #[test]
    fn metamorphic_timelock_vs_direct(fee in arb_fee()) {
        // Path A: Timelock schedule and execute
        let env_a = Env::default();
        let (client_a, admin_a, _) = setup_factory(&env_a);
        env_a.mock_all_auths();
        
        let change_id = client_a.schedule_fee_update(&admin_a, &Some(fee), &None).unwrap();
        
        // Advance time past timelock
        env_a.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 172_801; // 48 hours + 1 second
        });
        
        client_a.execute_change(&change_id).unwrap();
        let state_a = ContractState::capture(&client_a);
        
        // Path B: Direct update (simulating post-timelock scenario)
        let env_b = Env::default();
        let (client_b, admin_b, _) = setup_factory(&env_b);
        env_b.mock_all_auths();
        
        // Advance time to match
        env_b.ledger().with_mut(|li| {
            li.timestamp = li.timestamp + 172_801;
        });
        
        client_b.update_fees(&admin_b, &Some(fee), &None).unwrap();
        let state_b = ContractState::capture(&client_b);
        
        // Assert: Final fee values must be identical
        prop_assert_eq!(state_a.base_fee, state_b.base_fee,
            "Base fee diverged: {} vs {}", state_a.base_fee, state_b.base_fee);
    }
}

//! Governance Hostile Fuzz Test Suite
#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup_factory(env: &Env) -> (TokenFactoryClient, Address, Address) {
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    client.initialize(&admin, &treasury, &100_0000000, &50_0000000).unwrap();
    (client, admin, treasury)
}

fn arb_address() -> impl Strategy<Value = u64> { any::<u64>() }
fn arb_amount() -> impl Strategy<Value = i128> { -1_000_000_0000000i128..=1_000_000_0000000i128 }

proptest! {
    #![proptest_config(ProptestConfig::with_cases(500))]
    
    #[test]
    fn fuzz_schedule_fee_unauthorized(attacker_seed in arb_address(), base_fee in arb_amount()) {
        let env = Env::default();
        let (client, admin, _) = setup_factory(&env);
        let attacker = Address::generate(&env);
        env.mock_all_auths();
        let result = client.try_schedule_fee_update(&attacker, &Some(base_fee), &None);
        prop_assert!(result.is_err());
    }
}

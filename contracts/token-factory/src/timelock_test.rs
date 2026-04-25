#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &1_000_000, &500_000);

    (env, contract_id, admin, treasury)
}

#[test]
fn test_timelock_basic_setup() {
    let (_env, _contract_id, _admin, _treasury) = setup();
    // Basic test to verify setup works
}

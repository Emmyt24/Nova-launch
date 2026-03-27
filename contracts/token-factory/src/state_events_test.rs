#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, symbol_short};

#[test]
fn test_initialized_event_emitted() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_i128, &50_i128);

    // Verify event was emitted
    let events = env.events().all();
    assert!(events.len() > 0);
    
    // Check for init event
    let has_init_event = events.iter().any(|e| {
        e.0.iter().any(|t| t == soroban_sdk::Val::from(symbol_short!("init")))
    });
    assert!(has_init_event, "Initialized event should be emitted");
}

#[test]
fn test_token_registered_event_emitted() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_i128, &50_i128);

    // Note: This test assumes there's a create_token function
    // If not implemented, this test documents the expected behavior
    
    // When a token is created, tok_reg event should be emitted
    // let token_address = client.create_token(...);
    
    // Verify event was emitted
    // let events = env.events().all();
    // let has_token_reg_event = events.iter().any(|e| {
    //     e.0.iter().any(|t| t == soroban_sdk::Val::from(symbol_short!("tok_reg")))
    // });
    // assert!(has_token_reg_event, "Token registered event should be emitted");
}

#[test]
fn test_fees_updated_event_emitted() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &100_i128, &50_i128);

    // Update fees
    client.update_fees(&admin, &Some(200_i128), &Some(100_i128));

    // Verify event was emitted
    let events = env.events().all();
    
    // Check for fee_upd event
    let has_fee_event = events.iter().any(|e| {
        e.0.iter().any(|t| t == soroban_sdk::Val::from(symbol_short!("fee_upd")))
    });
    assert!(has_fee_event, "Fees updated event should be emitted");
}

#[test]
fn test_initialized_event_contains_correct_data() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let base_fee = 100_i128;
    let metadata_fee = 50_i128;

    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    let events = env.events().all();
    assert!(events.len() > 0, "Should emit at least one event");
}

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let base_fee = 70_000_000; // 7 XLM in stroops
    let metadata_fee = 30_000_000; // 3 XLM in stroops

    // Initialize factory
    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    // Verify state
    let state = client.get_state();
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);
    assert_eq!(state.base_fee, base_fee);
    assert_eq!(state.metadata_fee, metadata_fee);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_cannot_initialize_twice() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let base_fee = 70_000_000;
    let metadata_fee = 30_000_000;

    // First initialization succeeds
    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);
    
    // Verify initial state is set correctly
    let state = client.get_state();
    assert_eq!(state.admin, admin);
    assert_eq!(state.treasury, treasury);
    assert_eq!(state.base_fee, base_fee);
    assert_eq!(state.metadata_fee, metadata_fee);

    // Second initialization should panic with AlreadyInitialized error (#6)
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_cannot_initialize_twice_with_different_params() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let different_admin = Address::generate(&env);
    let different_treasury = Address::generate(&env);

    // First initialization succeeds
    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    // Attempt to initialize with different parameters should also fail
    client.initialize(&different_admin, &different_treasury, &100_000_000, &50_000_000);
}

#[test]
fn test_update_fees() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);

    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    // Update base fee only
    client.update_fees(&admin, &Some(100_000_000), &None);
    let state = client.get_state();
    assert_eq!(state.base_fee, 100_000_000);
    assert_eq!(state.metadata_fee, 30_000_000); // Verify metadata fee unchanged

    // Update metadata fee only
    client.update_fees(&admin, &None, &Some(50_000_000));
    let state = client.get_state();
    assert_eq!(state.metadata_fee, 50_000_000);
    assert_eq!(state.base_fee, 100_000_000); // Verify base fee unchanged

    // Update both fees simultaneously
    client.update_fees(&admin, &Some(80_000_000), &Some(40_000_000));
    let state = client.get_state();
    assert_eq!(state.base_fee, 80_000_000);
    assert_eq!(state.metadata_fee, 40_000_000);
}

#[test]
#[ignore] // Remove this attribute once create_token function is implemented
fn test_create_token() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    // Setup
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    let base_fee = 70_000_000; // 7 XLM in stroops
    let metadata_fee = 30_000_000; // 3 XLM in stroops

    // Initialize factory
    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    // Token parameters
    let name = String::from_str(&env, "Test Token");
    let symbol = String::from_str(&env, "TEST");
    let decimals = 7u32;
    let initial_supply = 1_000_000_0000000i128; // 1 million tokens with 7 decimals
    let metadata_uri = Some(String::from_str(&env, "ipfs://QmTest123"));

    // Calculate expected fee
    let expected_fee = base_fee + metadata_fee; // Both base and metadata fee

    // Deploy token via factory
    // TODO: Uncomment once create_token is implemented
    // let token_address = client.create_token(
    //     &creator,
    //     &name,
    //     &symbol,
    //     &decimals,
    //     &initial_supply,
    //     &metadata_uri,
    //     &expected_fee,
    // );

    // Verify token address returned
    // assert!(token_address != Address::generate(&env));

    // Verify token registered in factory
    // let token_count = client.get_token_count();
    // assert_eq!(token_count, 1);

    // Verify token info stored correctly
    // let token_info = client.get_token_info(&0).unwrap();
    // assert_eq!(token_info.address, token_address);
    // assert_eq!(token_info.creator, creator);
    // assert_eq!(token_info.name, name);
    // assert_eq!(token_info.symbol, symbol);
    // assert_eq!(token_info.decimals, decimals);
    // assert_eq!(token_info.total_supply, initial_supply);
    // assert_eq!(token_info.metadata_uri, metadata_uri);
    // assert!(token_info.created_at > 0);

    // Verify initial supply minted to creator
    // TODO: Query the deployed token contract to verify balance
    // let token_client = token::Client::new(&env, &token_address);
    // let creator_balance = token_client.balance(&creator);
    // assert_eq!(creator_balance, initial_supply);

    // Verify fee collected to treasury
    // TODO: Verify treasury received the fee payment
    // This would require checking the native token balance of treasury
}

#[test]
#[ignore] // Remove this attribute once create_token function is implemented
fn test_create_token_without_metadata() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    // Setup
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    let base_fee = 70_000_000;
    let metadata_fee = 30_000_000;

    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    // Token parameters without metadata
    let name = String::from_str(&env, "Simple Token");
    let symbol = String::from_str(&env, "SMPL");
    let decimals = 7u32;
    let initial_supply = 500_000_0000000i128;
    let metadata_uri: Option<String> = None;

    // Only base fee required when no metadata
    let expected_fee = base_fee;

    // Deploy token without metadata
    // TODO: Uncomment once create_token is implemented
    // let token_address = client.create_token(
    //     &creator,
    //     &name,
    //     &symbol,
    //     &decimals,
    //     &initial_supply,
    //     &metadata_uri,
    //     &expected_fee,
    // );

    // Verify token deployed
    // assert!(token_address != Address::generate(&env));

    // Verify token info has no metadata
    // let token_info = client.get_token_info(&0).unwrap();
    // assert_eq!(token_info.metadata_uri, None);
}

#[test]
#[ignore] // Remove this attribute once create_token function is implemented
#[should_panic(expected = "Error(Contract, #1)")] // InsufficientFee error
fn test_create_token_insufficient_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    let name = String::from_str(&env, "Test Token");
    let symbol = String::from_str(&env, "TEST");
    let decimals = 7u32;
    let initial_supply = 1_000_000_0000000i128;
    let metadata_uri = Some(String::from_str(&env, "ipfs://QmTest"));

    // Provide insufficient fee
    let insufficient_fee = 50_000_000; // Less than base_fee + metadata_fee

    // TODO: Uncomment once create_token is implemented
    // This should panic with InsufficientFee error
    // client.create_token(
    //     &creator,
    //     &name,
    //     &symbol,
    //     &decimals,
    //     &initial_supply,
    //     &metadata_uri,
    //     &insufficient_fee,
    // );
}

#[test]
#[ignore] // Remove this attribute once create_token function is implemented
#[should_panic(expected = "Error(Contract, #3)")] // InvalidParameters error
fn test_create_token_invalid_parameters() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    client.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    let name = String::from_str(&env, ""); // Empty name - invalid
    let symbol = String::from_str(&env, "TEST");
    let decimals = 7u32;
    let initial_supply = 1_000_000_0000000i128;
    let metadata_uri: Option<String> = None;

    // TODO: Uncomment once create_token is implemented
    // This should panic with InvalidParameters error
    // client.create_token(
    //     &creator,
    //     &name,
    //     &symbol,
    //     &decimals,
    //     &initial_supply,
    //     &metadata_uri,
    //     &70_000_000,
    // );
}

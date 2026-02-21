use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};
use types::{Error, TokenInfo};

#[test]
fn test_token_registry_functionality() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    let base_fee = 70_000_000;
    let metadata_fee = 30_000_000;

    client.initialize(&admin, &treasury, &base_fee, &metadata_fee);

    // 1. Verify initial token count is 0
    assert_eq!(client.get_token_count(), 0);

    // 2. Deploy multiple tokens
    let name1 = String::from_str(&env, "Token One");
    let symbol1 = String::from_str(&env, "TK1");
    let decimals1 = 7u32;
    let supply1 = 1_000_000_000i128;
    let metadata1 = Some(String::from_str(&env, "ipfs://hash1"));
    let fee1 = base_fee + metadata_fee;

    client.create_token(
        &creator, &name1, &symbol1, &decimals1, &supply1, &metadata1, &fee1,
    );

    // Verify token count increases
    assert_eq!(client.get_token_count(), 1);

    let name2 = String::from_str(&env, "Token Two");
    let symbol2 = String::from_str(&env, "TK2");
    let decimals2 = 18u32;
    let supply2 = 5_000_000_000i128;
    let metadata2: Option<String> = None;
    let fee2 = base_fee;

    client.create_token(
        &creator, &name2, &symbol2, &decimals2, &supply2, &metadata2, &fee2,
    );

    // Verify token count increases again
    assert_eq!(client.get_token_count(), 2);

    // 3. Retrieve token info by index and verify accuracy
    // Token 0
    let info1 = client.get_token_info(&0);
    assert_eq!(info1.name, name1);
    assert_eq!(info1.symbol, symbol1);
    assert_eq!(info1.decimals, decimals1);
    assert_eq!(info1.total_supply, supply1);
    assert_eq!(info1.metadata_uri, metadata1);
    assert_eq!(info1.creator, creator);

    // Token 1
    let info2 = client.get_token_info(&1);
    assert_eq!(info2.name, name2);
    assert_eq!(info2.symbol, symbol2);
    assert_eq!(info2.decimals, decimals2);
    assert_eq!(info2.total_supply, supply2);
    assert_eq!(info2.metadata_uri, metadata2);
    assert_eq!(info2.creator, creator);

    // 4. Test invalid index returns error
    let result = client.try_get_token_info(&2);
    assert_eq!(result, Err(Ok(Error::TokenNotFound)));
}

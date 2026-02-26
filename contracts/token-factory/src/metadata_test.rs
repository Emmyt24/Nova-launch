#![cfg(test)]

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_get_metadata() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let metadata = client.get_metadata();

    assert_eq!(metadata.name, String::from_str(&env, "Nova Launch Token Factory"));
    assert_eq!(metadata.description, String::from_str(&env, "No-code token deployment on Stellar"));
    assert_eq!(metadata.author, String::from_str(&env, "Nova Launch Team"));
    assert_eq!(metadata.license, String::from_str(&env, "MIT"));
    assert_eq!(metadata.version, String::from_str(&env, "1.0.0"));
}

#[test]
fn test_metadata_fields_not_empty() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let metadata = client.get_metadata();

    assert!(metadata.name.len() > 0);
    assert!(metadata.description.len() > 0);
    assert!(metadata.author.len() > 0);
    assert!(metadata.license.len() > 0);
    assert!(metadata.version.len() > 0);
}

#[test]
fn test_metadata_accessible_without_initialization() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    // Should be able to get metadata without initializing the contract
    let metadata = client.get_metadata();
    assert_eq!(metadata.name, String::from_str(&env, "Nova Launch Token Factory"));
}

#[test]
fn test_metadata_consistency() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&env, &contract_id);

    let metadata1 = client.get_metadata();
    let metadata2 = client.get_metadata();

    // Metadata should be consistent across calls
    assert_eq!(metadata1.name, metadata2.name);
    assert_eq!(metadata1.description, metadata2.description);
    assert_eq!(metadata1.author, metadata2.author);
    assert_eq!(metadata1.license, metadata2.license);
    assert_eq!(metadata1.version, metadata2.version);
}

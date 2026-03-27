/// Example: Using the set_metadata entrypoint
///
/// This example demonstrates how to use the set_metadata function
/// with proper error handling and mutability rules.
use soroban_sdk::{Address, Env, String};

// Note: This is a conceptual example. In practice, you would use the generated client.

/// Example 1: Successfully setting metadata for the first time
pub fn example_set_metadata_success(
    env: &Env,
    factory_client: &TokenFactoryClient,
    token_index: u32,
    creator: &Address,
) {
    // Create metadata URI (typically an IPFS hash)
    let metadata_uri =
        String::from_str(env, "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG");

    // Set metadata - this will succeed if:
    // 1. Contract is not paused
    // 2. Token exists
    // 3. Caller is the token creator
    // 4. Metadata has not been set before
    factory_client.set_metadata(&token_index, creator, &metadata_uri);

    println!("✅ Metadata set successfully!");
}

/// Example 2: Handling metadata immutability
pub fn example_metadata_immutability(
    env: &Env,
    factory_client: &TokenFactoryClient,
    token_index: u32,
    creator: &Address,
) {
    // Set metadata for the first time
    let initial_uri = String::from_str(env, "ipfs://QmInitialMetadata");
    factory_client.set_metadata(&token_index, creator, &initial_uri);

    // Attempt to change metadata - this will fail
    let new_uri = String::from_str(env, "ipfs://QmNewMetadata");
    let result = factory_client.try_set_metadata(&token_index, creator, &new_uri);

    match result {
        Ok(_) => println!("❌ This should not happen!"),
        Err(e) => {
            // Expected: Error::MetadataAlreadySet
            println!("✅ Metadata is immutable: {:?}", e);
        }
    }
}

/// Example 3: Error handling for unauthorized access
pub fn example_unauthorized_access(
    env: &Env,
    factory_client: &TokenFactoryClient,
    token_index: u32,
    creator: &Address,
    attacker: &Address,
) {
    let metadata_uri = String::from_str(env, "ipfs://QmMaliciousMetadata");

    // Attempt to set metadata as non-creator - this will fail
    let result = factory_client.try_set_metadata(&token_index, attacker, &metadata_uri);

    match result {
        Ok(_) => println!("❌ Security breach!"),
        Err(e) => {
            // Expected: Error::Unauthorized
            println!("✅ Authorization check passed: {:?}", e);
        }
    }
}

/// Example 4: Checking if metadata is already set
pub fn example_check_metadata_status(
    factory_client: &TokenFactoryClient,
    token_index: u32,
) -> bool {
    // Get token info
    let token_info = factory_client.get_token_info(&token_index);

    // Check if metadata is set
    match token_info.metadata_uri {
        Some(uri) => {
            println!("✅ Metadata already set: {}", uri);
            true
        }
        None => {
            println!("ℹ️  Metadata not set yet");
            false
        }
    }
}

/// Example 5: Safe metadata setting with pre-checks
pub fn example_safe_metadata_setting(
    env: &Env,
    factory_client: &TokenFactoryClient,
    token_index: u32,
    creator: &Address,
    metadata_uri: String,
) -> Result<(), String> {
    // Pre-check 1: Verify token exists
    let token_info_result = factory_client.try_get_token_info(&token_index);
    if token_info_result.is_err() {
        return Err("Token does not exist".to_string());
    }

    let token_info = token_info_result.unwrap();

    // Pre-check 2: Verify caller is creator
    if token_info.creator != *creator {
        return Err("Only token creator can set metadata".to_string());
    }

    // Pre-check 3: Verify metadata not already set
    if token_info.metadata_uri.is_some() {
        return Err("Metadata already set (immutable)".to_string());
    }

    // Pre-check 4: Verify contract not paused
    if factory_client.is_paused() {
        return Err("Contract is paused".to_string());
    }

    // All checks passed - set metadata
    factory_client.set_metadata(&token_index, creator, &metadata_uri);

    Ok(())
}

/// Example 6: Batch metadata setting for multiple tokens
pub fn example_batch_metadata_setting(
    env: &Env,
    factory_client: &TokenFactoryClient,
    creator: &Address,
    tokens_and_uris: Vec<(u32, String)>,
) -> Vec<Result<(), String>> {
    let mut results = Vec::new();

    for (token_index, metadata_uri) in tokens_and_uris {
        let result = factory_client.try_set_metadata(&token_index, creator, &metadata_uri);

        match result {
            Ok(_) => {
                results.push(Ok(()));
                println!("✅ Token {}: Metadata set", token_index);
            }
            Err(e) => {
                results.push(Err(format!("Token {}: {:?}", token_index, e)));
                println!("❌ Token {}: Failed - {:?}", token_index, e);
            }
        }
    }

    results
}

/// Example 7: Different metadata URI formats
pub fn example_metadata_uri_formats(env: &Env) {
    // IPFS CIDv0
    let ipfs_v0 = String::from_str(env, "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG");

    // IPFS CIDv1
    let ipfs_v1 = String::from_str(
        env,
        "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    );

    // Arweave
    let arweave = String::from_str(env, "ar://abcd1234efgh5678ijkl9012mnop3456");

    // HTTPS (centralized, not recommended for immutability)
    let https = String::from_str(env, "https://metadata.example.com/token/123.json");

    println!("Supported URI formats:");
    println!("  IPFS CIDv0: {}", ipfs_v0);
    println!("  IPFS CIDv1: {}", ipfs_v1);
    println!("  Arweave: {}", arweave);
    println!("  HTTPS: {} (not recommended)", https);
}

/// Example 8: Verifying metadata after setting
pub fn example_verify_metadata(
    factory_client: &TokenFactoryClient,
    token_index: u32,
    expected_uri: &String,
) -> bool {
    // Get token info
    let token_info = factory_client.get_token_info(&token_index);

    // Verify metadata matches expected value
    match token_info.metadata_uri {
        Some(actual_uri) => {
            if actual_uri == *expected_uri {
                println!("✅ Metadata verified: {}", actual_uri);
                true
            } else {
                println!("❌ Metadata mismatch!");
                println!("   Expected: {}", expected_uri);
                println!("   Actual: {}", actual_uri);
                false
            }
        }
        None => {
            println!("❌ Metadata not set");
            false
        }
    }
}

/// Example 9: Metadata setting workflow
pub fn example_complete_workflow(
    env: &Env,
    factory_client: &TokenFactoryClient,
    token_index: u32,
    creator: &Address,
) {
    println!("=== Metadata Setting Workflow ===\n");

    // Step 1: Check current status
    println!("Step 1: Checking current metadata status...");
    let has_metadata = example_check_metadata_status(factory_client, token_index);

    if has_metadata {
        println!("⚠️  Metadata already set. Cannot proceed.\n");
        return;
    }

    // Step 2: Prepare metadata URI
    println!("\nStep 2: Preparing metadata URI...");
    let metadata_uri =
        String::from_str(env, "ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG");
    println!("   URI: {}", metadata_uri);

    // Step 3: Set metadata
    println!("\nStep 3: Setting metadata...");
    match example_safe_metadata_setting(
        env,
        factory_client,
        token_index,
        creator,
        metadata_uri.clone(),
    ) {
        Ok(_) => println!("   ✅ Success!"),
        Err(e) => {
            println!("   ❌ Failed: {}", e);
            return;
        }
    }

    // Step 4: Verify metadata was set
    println!("\nStep 4: Verifying metadata...");
    example_verify_metadata(factory_client, token_index, &metadata_uri);

    // Step 5: Test immutability
    println!("\nStep 5: Testing immutability...");
    let new_uri = String::from_str(env, "ipfs://QmNewUri");
    let result = factory_client.try_set_metadata(&token_index, creator, &new_uri);
    match result {
        Ok(_) => println!("   ❌ Immutability check failed!"),
        Err(_) => println!("   ✅ Immutability confirmed!"),
    }

    println!("\n=== Workflow Complete ===");
}

/// Example 10: Error code reference
pub fn example_error_codes() {
    println!("=== set_metadata Error Codes ===\n");
    println!("Error::ContractPaused (14)");
    println!("  - Contract is currently paused");
    println!("  - Solution: Wait for unpause or contact admin\n");

    println!("Error::TokenNotFound (4)");
    println!("  - Token index does not exist");
    println!("  - Solution: Verify token index is correct\n");

    println!("Error::Unauthorized (2)");
    println!("  - Caller is not the token creator");
    println!("  - Solution: Use creator address to call function\n");

    println!("Error::MetadataAlreadySet (5)");
    println!("  - Metadata has already been set (immutable)");
    println!("  - Solution: Cannot change metadata once set\n");
}

// Note: TokenFactoryClient would be generated by the Soroban SDK
// This is a placeholder for demonstration purposes
struct TokenFactoryClient;

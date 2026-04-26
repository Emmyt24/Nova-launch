extern crate std;
use std::println;

use super::*;
use soroban_sdk::{Address, Env};
use soroban_sdk::testutils::{Address as _, Ledger};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

struct BenchSetup {
    env: Env,
    admin: Address,
    treasury: Address,
}

impl BenchSetup {
    /// Register the contract and generate test addresses. Does NOT initialize.
    fn new() -> Self {
        let env = Env::default();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        BenchSetup {
            env,
            admin,
            treasury,
        }
    }

    /// Register + initialize the contract, return setup and client contract id.
    fn initialized() -> (Self, soroban_sdk::Address) {
        let setup = BenchSetup::new();
        let contract_id = setup.env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&setup.env, &contract_id);
        client.initialize(&setup.admin, &setup.treasury, &70_000_000, &30_000_000);
        (setup, contract_id)
    }
}

/// Capture CPU instructions and memory bytes for a single contract call.
/// Resets the budget immediately before the closure runs so the measurement
/// is isolated to that one operation.
fn measure<F: FnOnce()>(env: &Env, f: F) -> (u64, u64) {
    env.budget().reset_unlimited();
    env.budget().reset_default();
    f();
    (
        env.budget().cpu_instruction_cost(),
        env.budget().memory_bytes_cost(),
    )
}

// ---------------------------------------------------------------------------
// Individual operation benchmarks
// ---------------------------------------------------------------------------

/// Benchmark: `initialize()`
///
/// Measures the cost of first-time factory initialization including
/// storage writes for admin, treasury, base_fee, and metadata_fee.
#[test]
fn bench_initialize() {
    let setup = BenchSetup::new();
    let contract_id = setup.env.register_contract(None, TokenFactory);
    let client = TokenFactoryClient::new(&setup.env, &contract_id);

    let (cpu, mem) = measure(&setup.env, || {
        client.initialize(&setup.admin, &setup.treasury, &70_000_000, &30_000_000);
    });

    println!("[bench_initialize] cpu_instructions={cpu}, memory_bytes={mem}");

    assert!(cpu > 0, "CPU cost for initialize should be non-zero");
    assert!(mem > 0, "Memory cost for initialize should be non-zero");
}

/// Benchmark: `get_state()`
///
/// Measures the cost of reading all four storage entries (admin, treasury,
/// base_fee, metadata_fee) and assembling a FactoryState struct.
#[test]
fn bench_get_state() {
    let (setup, contract_id) = BenchSetup::initialized();
    let client = TokenFactoryClient::new(&setup.env, &contract_id);

    let (cpu, mem) = measure(&setup.env, || {
        let _ = client.get_state();
    });

    println!("[bench_get_state] cpu_instructions={cpu}, memory_bytes={mem}");

    assert!(cpu > 0, "CPU cost for get_state should be non-zero");
    assert!(mem > 0, "Memory cost for get_state should be non-zero");
}

/// Benchmark: `update_fees()` — updating both fees simultaneously
///
/// Measures authorization check + two conditional storage writes.
#[test]
fn bench_update_fees_both() {
    let (setup, contract_id) = BenchSetup::initialized();
    setup.env.mock_all_auths();
    let client = TokenFactoryClient::new(&setup.env, &contract_id);

    let (cpu, mem) = measure(&setup.env, || {
        client.update_fees(&setup.admin, &Some(100_000_000i128), &Some(50_000_000i128));
    });

    println!("[bench_update_fees_both] cpu_instructions={cpu}, memory_bytes={mem}");

    assert!(
        cpu > 0,
        "CPU cost for update_fees (both) should be non-zero"
    );
    assert!(
        mem > 0,
        "Memory cost for update_fees (both) should be non-zero"
    );
}

/// Benchmark: `update_fees()` — base fee only
///
/// Measures authorization check + one conditional storage write (base fee).
#[test]
fn bench_update_fees_base_only() {
    let (setup, contract_id) = BenchSetup::initialized();
    setup.env.mock_all_auths();
    let client = TokenFactoryClient::new(&setup.env, &contract_id);

    let (cpu, mem) = measure(&setup.env, || {
        client.update_fees(&setup.admin, &Some(100_000_000i128), &None);
    });

    println!("[bench_update_fees_base_only] cpu_instructions={cpu}, memory_bytes={mem}");

    assert!(
        cpu > 0,
        "CPU cost for update_fees (base only) should be non-zero"
    );
    assert!(
        mem > 0,
        "Memory cost for update_fees (base only) should be non-zero"
    );
}

/// Benchmark: `update_fees()` — metadata fee only
///
/// Measures authorization check + one conditional storage write (metadata fee).
#[test]
fn bench_update_fees_metadata_only() {
    let (setup, contract_id) = BenchSetup::initialized();
    setup.env.mock_all_auths();
    let client = TokenFactoryClient::new(&setup.env, &contract_id);

    let (cpu, mem) = measure(&setup.env, || {
        client.update_fees(&setup.admin, &None, &Some(50_000_000i128));
    });

    println!("[bench_update_fees_metadata_only] cpu_instructions={cpu}, memory_bytes={mem}");

    assert!(
        cpu > 0,
        "CPU cost for update_fees (metadata only) should be non-zero"
    );
    assert!(
        mem > 0,
        "Memory cost for update_fees (metadata only) should be non-zero"
    );
}


/// Benchmark: `get_token_info()` — error path (token not found)
///
/// Measures the cost of a failed storage lookup including the error conversion.
#[test]
fn bench_get_nonexistent_token() {
    let (setup, contract_id) = BenchSetup::initialized();
    let client = TokenFactoryClient::new(&setup.env, &contract_id);

    let (cpu, mem) = measure(&setup.env, || {
        // Use try_ variant so the test doesn't panic on the expected error
        let result = client.try_get_token_info(&0u32);
        assert!(result.is_err(), "Expected TokenNotFound error");
    });

    println!("[bench_get_nonexistent_token] cpu_instructions={cpu}, memory_bytes={mem}");

    assert!(
        cpu > 0,
        "CPU cost for get_token_info (not found) should be non-zero"
    );
    assert!(
        mem > 0,
        "Memory cost for get_token_info (not found) should be non-zero"
    );
}

// ---------------------------------------------------------------------------
// Placeholder benchmarks for unimplemented operations
// These will be enabled once create_token / mint_tokens / set_metadata
// are implemented in lib.rs (see ignored tests in test.rs).
// ---------------------------------------------------------------------------

/// Benchmark placeholder: `create_token()`
///
/// Will measure token deployment cost including sub-contract instantiation,
/// fee validation, and registry storage writes.
#[test]
#[ignore]
fn bench_create_token() {
    // TODO: enable once create_token() is implemented
    // Expected metrics to capture:
    //   - CPU instructions: token sub-contract deploy + storage writes
    //   - Memory bytes: TokenInfo struct + registry entry
    unimplemented!("create_token() not yet implemented in lib.rs")
}

/// Benchmark placeholder: `mint_tokens()`
///
/// Will measure admin-controlled minting including authorization check
/// and token balance update.
#[test]
#[ignore]
fn bench_mint_tokens() {
    // TODO: enable once mint_tokens() is implemented
    unimplemented!("mint_tokens() not yet implemented in lib.rs")
}

/// Benchmark placeholder: `set_metadata()`
///
/// Will measure IPFS URI storage write including duplicate-check guard.
#[test]
#[ignore]
fn bench_set_metadata() {
    // TODO: enable once set_metadata() is implemented
    unimplemented!("set_metadata() not yet implemented in lib.rs")
}

// ---------------------------------------------------------------------------
// Baseline report
// ---------------------------------------------------------------------------

/// Benchmark: full baseline report
///
/// Runs every implemented operation and prints a formatted ASCII table
/// suitable for copying into TESTING.md or PR descriptions.
/// Provides a single snapshot for establishing regression baselines.
///
/// Run with:
///   cargo test bench_baseline_report -- --nocapture
#[test]
fn bench_baseline_report() {
    // --- initialize ---
    let setup_init = BenchSetup::new();
    let cid_init = setup_init.env.register_contract(None, TokenFactory);
    let client_init = TokenFactoryClient::new(&setup_init.env, &cid_init);
    let (cpu_init, mem_init) = measure(&setup_init.env, || {
        client_init.initialize(
            &setup_init.admin,
            &setup_init.treasury,
            &70_000_000,
            &30_000_000,
        );
    });

    // --- remaining ops share an initialized env ---
    let (setup, contract_id) = BenchSetup::initialized();
    setup.env.mock_all_auths();
    let client = TokenFactoryClient::new(&setup.env, &contract_id);

    let (cpu_get_state, mem_get_state) = measure(&setup.env, || {
        let _ = client.get_state();
    });

    let (cpu_upd_both, mem_upd_both) = measure(&setup.env, || {
        client.update_fees(&setup.admin, &Some(100_000_000i128), &Some(50_000_000i128));
    });

    let (cpu_upd_base, mem_upd_base) = measure(&setup.env, || {
        client.update_fees(&setup.admin, &Some(80_000_000i128), &None);
    });

    let (cpu_upd_meta, mem_upd_meta) = measure(&setup.env, || {
        client.update_fees(&setup.admin, &None, &Some(40_000_000i128));
    });

    let (cpu_missing, mem_missing) = measure(&setup.env, || {
        let _ = client.try_get_token_info(&0u32);
    });

    // Print ASCII table
    println!();
    println!("Nova-Launch Token Factory — Contract Benchmark Baseline");
    println!("Generated by bench_baseline_report (soroban-sdk 21.0.0)");
    println!();
    println!(
        "{:<35} {:>18} {:>14}",
        "Operation", "CPU Instructions", "Memory Bytes"
    );
    println!("{}", "-".repeat(70));

    let rows: &[(&str, u64, u64)] = &[
        ("initialize", cpu_init, mem_init),
        ("get_state", cpu_get_state, mem_get_state),
        ("update_fees (both)", cpu_upd_both, mem_upd_both),
        ("update_fees (base only)", cpu_upd_base, mem_upd_base),
        ("update_fees (metadata only)", cpu_upd_meta, mem_upd_meta),

        ("get_token_info (not found)", cpu_missing, mem_missing),
    ];

    for (op, cpu, mem) in rows {
        println!("{:<35} {:>18} {:>14}", op, cpu, mem);
    }

    println!("{}", "-".repeat(70));
    println!();
    println!("NOTE: Pending benchmarks (create_token, mint_tokens, set_metadata)");
    println!("      are marked #[ignore] and will be enabled once implemented.");
    println!();

    // Sanity: every measured value must be non-zero
    for (op, cpu, mem) in rows {
        assert!(*cpu > 0, "CPU cost for '{op}' should be non-zero");
        assert!(*mem > 0, "Memory cost for '{op}' should be non-zero");
    }
}

// ---------------------------------------------------------------------------
// Streaming Operation Benchmarks
// ---------------------------------------------------------------------------

/// Benchmark: `create_stream()` gas consumption
///
/// Measures the cost of creating a new stream including:
/// - Stream ID generation
/// - Stream info storage
/// - Event emission
#[test]
#[ignore]
fn bench_create_stream() {
    let (setup, _contract_id) = BenchSetup::initialized();
    let creator = Address::generate(&setup.env);
    let recipient = Address::generate(&setup.env);

    let (cpu, mem) = measure(&setup.env, || {
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1_000_000_0000000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };
        setup.env.as_contract(&_contract_id, || {
            let _ = streaming::create_stream(&setup.env, &creator, &params);
        });
    });

    println!("[bench_create_stream] cpu_instructions={cpu}, memory_bytes={mem}");
    assert!(cpu > 0, "CPU cost for create_stream should be non-zero");
    assert!(mem > 0, "Memory cost for create_stream should be non-zero");
}

/// Benchmark: `claim_stream()` gas consumption
///
/// Measures the cost of claiming vested tokens including:
/// - Vesting calculation
/// - Amount validation
/// - Storage updates
/// - Event emission
#[test]
#[ignore]
fn bench_claim_stream() {
    let (setup, _contract_id) = BenchSetup::initialized();
    let creator = Address::generate(&setup.env);
    let recipient = Address::generate(&setup.env);

    // Create a stream first
    let params = StreamParams {
        recipient: recipient.clone(),
        token_index: 0,
        total_amount: 1_000_000_0000000,
        start_time: 100,
        end_time: 200,
        cliff_time: 150,
    };
    let stream_id = setup.env.as_contract(&_contract_id, || {
        streaming::create_stream(&setup.env, &creator, &params).unwrap()
    });

    // Advance time to cliff
    setup.env.ledger().with_mut(|li| {
        li.timestamp = 150;
    });

    let (cpu, mem) = measure(&setup.env, || {
        setup.env.as_contract(&_contract_id, || {
            let _ = streaming::claim_stream(&setup.env, &recipient, stream_id);
        });
    });

    println!("[bench_claim_stream] cpu_instructions={cpu}, memory_bytes={mem}");
    assert!(cpu > 0, "CPU cost for claim_stream should be non-zero");
    assert!(mem > 0, "Memory cost for claim_stream should be non-zero");
}

/// Benchmark: `cancel_stream()` gas consumption
///
/// Measures the cost of cancelling a stream including:
/// - Authorization check
/// - Stream state update
/// - Event emission
#[test]
#[ignore]
fn bench_cancel_stream() {
    let (setup, _contract_id) = BenchSetup::initialized();
    let creator = Address::generate(&setup.env);
    let recipient = Address::generate(&setup.env);

    // Create a stream first
    let params = StreamParams {
        recipient: recipient.clone(),
        token_index: 0,
        total_amount: 1_000_000_0000000,
        start_time: 100,
        end_time: 200,
        cliff_time: 150,
    };
    let stream_id = setup.env.as_contract(&_contract_id, || {
        streaming::create_stream(&setup.env, &creator, &params).unwrap()
    });

    let (cpu, mem) = measure(&setup.env, || {
        setup.env.as_contract(&_contract_id, || {
            let _ = streaming::cancel_stream(&setup.env, &creator, stream_id);
        });
    });

    println!("[bench_cancel_stream] cpu_instructions={cpu}, memory_bytes={mem}");
    assert!(cpu > 0, "CPU cost for cancel_stream should be non-zero");
    assert!(mem > 0, "Memory cost for cancel_stream should be non-zero");
}

/// Benchmark: `get_claimable_amount()` gas consumption
///
/// Measures the cost of calculating claimable amount including:
/// - Stream lookup
/// - Vesting calculation
/// - Time-based computation
#[test]
#[ignore]
fn bench_get_claimable_amount() {
    let (setup, _contract_id) = BenchSetup::initialized();
    let creator = Address::generate(&setup.env);
    let recipient = Address::generate(&setup.env);

    // Create a stream first
    let params = StreamParams {
        recipient: recipient.clone(),
        token_index: 0,
        total_amount: 1_000_000_0000000,
        start_time: 100,
        end_time: 200,
        cliff_time: 150,
    };
    let stream_id = setup.env.as_contract(&_contract_id, || {
        streaming::create_stream(&setup.env, &creator, &params).unwrap()
    });

    // Advance time to middle of vesting
    setup.env.ledger().with_mut(|li| {
        li.timestamp = 175;
    });

    let (cpu, mem) = measure(&setup.env, || {
        setup.env.as_contract(&_contract_id, || {
            let _ = streaming::get_claimable_amount(&setup.env, stream_id);
        });
    });

    println!("[bench_get_claimable_amount] cpu_instructions={cpu}, memory_bytes={mem}");
    assert!(cpu > 0, "CPU cost for get_claimable_amount should be non-zero");
    assert!(mem > 0, "Memory cost for get_claimable_amount should be non-zero");
}

/// Benchmark: Streaming operations comprehensive report
///
/// Generates a comprehensive report of all streaming operation gas costs
#[test]
#[ignore]
fn bench_streaming_comprehensive_report() {
    let (setup, _contract_id) = BenchSetup::initialized();
    let creator = Address::generate(&setup.env);
    let recipient = Address::generate(&setup.env);

    // Create stream
    let params = StreamParams {
        recipient: recipient.clone(),
        token_index: 0,
        total_amount: 1_000_000_0000000,
        start_time: 100,
        end_time: 200,
        cliff_time: 150,
    };
    let stream_id = setup.env.as_contract(&_contract_id, || {
        streaming::create_stream(&setup.env, &creator, &params).unwrap()
    });

    // Measure create_stream
    let (cpu_create, mem_create) = measure(&setup.env, || {
        let params = StreamParams {
            recipient: recipient.clone(),
            token_index: 0,
            total_amount: 1_000_000_0000000,
            start_time: 100,
            end_time: 200,
            cliff_time: 150,
        };
        setup.env.as_contract(&_contract_id, || {
            let _ = streaming::create_stream(&setup.env, &creator, &params);
        });
    });

    // Advance time to cliff
    setup.env.ledger().with_mut(|li| {
        li.timestamp = 150;
    });

    // Measure claim_stream
    let (cpu_claim, mem_claim) = measure(&setup.env, || {
        setup.env.as_contract(&_contract_id, || {
            let _ = streaming::claim_stream(&setup.env, &recipient, stream_id);
        });
    });

    // Measure get_claimable_amount
    let (cpu_claimable, mem_claimable) = measure(&setup.env, || {
        setup.env.as_contract(&_contract_id, || {
            let _ = streaming::get_claimable_amount(&setup.env, stream_id);
        });
    });

    // Measure cancel_stream
    let (cpu_cancel, mem_cancel) = measure(&setup.env, || {
        setup.env.as_contract(&_contract_id, || {
            let _ = streaming::cancel_stream(&setup.env, &creator, stream_id);
        });
    });

    // Print comprehensive report
    println!();
    println!("Nova-Launch Streaming Operations — Gas Consumption Benchmark");
    println!("Generated by bench_streaming_comprehensive_report");
    println!();
    println!(
        "{:<35} {:>18} {:>14}",
        "Operation", "CPU Instructions", "Memory Bytes"
    );
    println!("{}", "-".repeat(70));

    let rows: &[(&str, u64, u64)] = &[
        ("create_stream", cpu_create, mem_create),
        ("claim_stream", cpu_claim, mem_claim),
        ("get_claimable_amount", cpu_claimable, mem_claimable),
        ("cancel_stream", cpu_cancel, mem_cancel),
    ];

    for (op, cpu, mem) in rows {
        println!("{:<35} {:>18} {:>14}", op, cpu, mem);
    }

    println!("{}", "-".repeat(70));
    println!();

    // Sanity checks
    for (op, cpu, mem) in rows {
        assert!(*cpu > 0, "CPU cost for '{op}' should be non-zero");
        assert!(*mem > 0, "Memory cost for '{op}' should be non-zero");
    }

    // Performance assertions
    // create_stream should be more expensive than claim_stream
    assert!(
        cpu_create > cpu_claim,
        "create_stream should be more expensive than claim_stream"
    );

    // get_claimable_amount should be cheaper than claim_stream
    assert!(
        cpu_claimable < cpu_claim,
        "get_claimable_amount should be cheaper than claim_stream"
    );
}

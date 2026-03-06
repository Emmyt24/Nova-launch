#![cfg(test)]
extern crate std;
use std::println;
use std::vec;
use std::vec::Vec;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String};

// ---------------------------------------------------------------------------
// Governance Benchmark Configuration
// ---------------------------------------------------------------------------

const ITERATIONS: usize = 100;
const REGRESSION_THRESHOLD: f64 = 0.10; // 10% increase triggers warning

// Baseline values for governance operations (update after initial run)
const BASELINE_TRANSFER_ADMIN_CPU: u64 = 0;
const BASELINE_PAUSE_CPU: u64 = 0;
const BASELINE_UNPAUSE_CPU: u64 = 0;
const BASELINE_UPDATE_FEES_SINGLE_CPU: u64 = 0;
const BASELINE_UPDATE_FEES_BOTH_CPU: u64 = 0;
const BASELINE_BATCH_UPDATE_ADMIN_CPU: u64 = 0;
const BASELINE_SET_CLAWBACK_CPU: u64 = 0;

// ---------------------------------------------------------------------------
// Statistical Helpers
// ---------------------------------------------------------------------------

struct BenchmarkStats {
    min: u64,
    max: u64,
    avg: f64,
    median: u64,
    p95: u64,
    p99: u64,
    std_dev: f64,
}

impl BenchmarkStats {
    fn from_samples(mut samples: Vec<u64>) -> Self {
        samples.sort_unstable();
        let len = samples.len();
        
        let min = samples[0];
        let max = samples[len - 1];
        let sum: u64 = samples.iter().sum();
        let avg = sum as f64 / len as f64;
        
        let median = if len % 2 == 0 {
            (samples[len / 2 - 1] + samples[len / 2]) / 2
        } else {
            samples[len / 2]
        };
        
        let p95_idx = (len as f64 * 0.95) as usize;
        let p99_idx = (len as f64 * 0.99) as usize;
        let p95 = samples[p95_idx.min(len - 1)];
        let p99 = samples[p99_idx.min(len - 1)];
        
        // Calculate standard deviation
        let variance: f64 = samples
            .iter()
            .map(|&x| {
                let diff = x as f64 - avg;
                diff * diff
            })
            .sum::<f64>()
            / len as f64;
        let std_dev = variance.sqrt();
        
        Self {
            min,
            max,
            avg,
            median,
            p95,
            p99,
            std_dev,
        }
    }
    
    fn check_regression(&self, baseline: u64, operation: &str) -> bool {
        if baseline == 0 {
            println!("  [INFO] No baseline set for {}", operation);
            return false;
        }
        
        let increase = (self.avg - baseline as f64) / baseline as f64;
        if increase > REGRESSION_THRESHOLD {
            println!(
                "  [REGRESSION] {} increased by {:.1}% (threshold: {:.1}%)",
                operation,
                increase * 100.0,
                REGRESSION_THRESHOLD * 100.0
            );
            return true;
        }
        false
    }
    
    fn print(&self, operation: &str) {
        println!("\n{}", "=".repeat(70));
        println!("Governance Benchmark: {}", operation);
        println!("{}", "=".repeat(70));
        println!("  Iterations:      {}", ITERATIONS);
        println!("  Min:             {} CPU instructions", self.min);
        println!("  Max:             {} CPU instructions", self.max);
        println!("  Average:         {:.2} CPU instructions", self.avg);
        println!("  Median:          {} CPU instructions", self.median);
        println!("  95th percentile: {} CPU instructions", self.p95);
        println!("  99th percentile: {} CPU instructions", self.p99);
        println!("  Std Deviation:   {:.2}", self.std_dev);
    }
}

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

struct GovBenchSetup {
    env: Env,
    admin: Address,
    treasury: Address,
    client: TokenFactoryClient<'static>,
}

impl GovBenchSetup {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        
        let contract_id = env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&env, &contract_id);
        
        client.initialize(&admin, &treasury, &100_000_000, &50_000_000);
        
        Self {
            env,
            admin,
            treasury,
            client,
        }
    }
    
    fn create_test_token(&self, creator: &Address) -> u32 {
        let token_address = Address::generate(&self.env);
        let token_info = crate::types::TokenInfo {
            address: token_address.clone(),
            creator: creator.clone(),
            name: String::from_str(&self.env, "Test Token"),
            symbol: String::from_str(&self.env, "TEST"),
            decimals: 7,
            total_supply: 1_000_000_0000000,
            initial_supply: 1_000_000_0000000,
            total_burned: 0,
            burn_count: 0,
            metadata_uri: None,
            created_at: self.env.ledger().timestamp(),
            clawback_enabled: false,
        };
        
        let token_index = crate::storage::get_token_count(&self.env);
        crate::storage::set_token_info(&self.env, token_index, &token_info);
        crate::storage::set_token_info_by_address(&self.env, &token_address, &token_info);
        crate::storage::increment_token_count(&self.env);
        
        token_index
    }
}

fn measure_cpu<F: FnOnce()>(env: &Env, f: F) -> u64 {
    env.budget().reset_unlimited();
    env.budget().reset_default();
    f();
    env.budget().cpu_instruction_cost()
}

// ---------------------------------------------------------------------------
// Governance Benchmark Tests
// ---------------------------------------------------------------------------

#[test]
fn bench_gov_transfer_admin() {
    println!("\n🔧 Benchmarking: transfer_admin()");
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for _ in 0..ITERATIONS {
        let setup = GovBenchSetup::new();
        let new_admin = Address::generate(&setup.env);
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.transfer_admin(&setup.admin, &new_admin);
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("transfer_admin()");
    stats.check_regression(BASELINE_TRANSFER_ADMIN_CPU, "transfer_admin");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

#[test]
fn bench_gov_pause() {
    println!("\n🔧 Benchmarking: pause()");
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for _ in 0..ITERATIONS {
        let setup = GovBenchSetup::new();
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.pause(&setup.admin);
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("pause()");
    stats.check_regression(BASELINE_PAUSE_CPU, "pause");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

#[test]
fn bench_gov_unpause() {
    println!("\n🔧 Benchmarking: unpause()");
    let setup = GovBenchSetup::new();
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for i in 0..ITERATIONS {
        // Alternate pause/unpause to measure unpause
        if i % 2 == 0 {
            setup.client.pause(&setup.admin);
        }
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.unpause(&setup.admin);
        });
        
        samples.push(cpu);
        
        // Pause again for next iteration
        if i % 2 == 1 {
            setup.client.pause(&setup.admin);
        }
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("unpause()");
    stats.check_regression(BASELINE_UNPAUSE_CPU, "unpause");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

#[test]
fn bench_gov_update_fees_single() {
    println!("\n🔧 Benchmarking: update_fees() [single fee]");
    let setup = GovBenchSetup::new();
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for i in 0..ITERATIONS {
        let new_fee = 100_000_000 + (i as i128 * 1000);
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.update_fees(&setup.admin, &Some(new_fee), &None);
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("update_fees() [single]");
    stats.check_regression(BASELINE_UPDATE_FEES_SINGLE_CPU, "update_fees_single");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

#[test]
fn bench_gov_update_fees_both() {
    println!("\n🔧 Benchmarking: update_fees() [both fees]");
    let setup = GovBenchSetup::new();
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for i in 0..ITERATIONS {
        let base_fee = 100_000_000 + (i as i128 * 1000);
        let metadata_fee = 50_000_000 + (i as i128 * 500);
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.update_fees(&setup.admin, &Some(base_fee), &Some(metadata_fee));
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("update_fees() [both]");
    stats.check_regression(BASELINE_UPDATE_FEES_BOTH_CPU, "update_fees_both");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

#[test]
fn bench_gov_batch_update_admin() {
    println!("\n🔧 Benchmarking: batch_update_admin()");
    let setup = GovBenchSetup::new();
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for i in 0..ITERATIONS {
        let base_fee = 100_000_000 + (i as i128 * 1000);
        let metadata_fee = 50_000_000 + (i as i128 * 500);
        let paused = i % 2 == 0;
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.batch_update_admin(
                &setup.admin,
                &Some(base_fee),
                &Some(metadata_fee),
                &Some(paused),
            );
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("batch_update_admin()");
    stats.check_regression(BASELINE_BATCH_UPDATE_ADMIN_CPU, "batch_update_admin");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

#[test]
fn bench_gov_set_clawback_enable() {
    println!("\n🔧 Benchmarking: set_clawback() [enable]");
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for _ in 0..ITERATIONS {
        let setup = GovBenchSetup::new();
        let creator = Address::generate(&setup.env);
        let token_index = setup.create_test_token(&creator);
        let token_info = crate::storage::get_token_info(&setup.env, token_index).unwrap();
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.set_clawback(&token_info.address, &creator, &true);
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("set_clawback() [enable]");
    stats.check_regression(BASELINE_SET_CLAWBACK_CPU, "set_clawback");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

#[test]
fn bench_gov_set_clawback_disable() {
    println!("\n🔧 Benchmarking: set_clawback() [disable]");
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for _ in 0..ITERATIONS {
        let setup = GovBenchSetup::new();
        let creator = Address::generate(&setup.env);
        let token_index = setup.create_test_token(&creator);
        let token_info = crate::storage::get_token_info(&setup.env, token_index).unwrap();
        
        // First enable clawback
        setup.client.set_clawback(&token_info.address, &creator, &true);
        
        // Then measure disabling it
        let cpu = measure_cpu(&setup.env, || {
            setup.client.set_clawback(&token_info.address, &creator, &false);
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("set_clawback() [disable]");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

#[test]
fn bench_gov_is_paused() {
    println!("\n🔧 Benchmarking: is_paused() [read-only]");
    let setup = GovBenchSetup::new();
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for _ in 0..ITERATIONS {
        let cpu = measure_cpu(&setup.env, || {
            let _ = setup.client.is_paused();
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("is_paused()");
    
    assert!(stats.avg > 0.0, "Average CPU cost should be non-zero");
}

// ---------------------------------------------------------------------------
// Comparative Analysis Tests
// ---------------------------------------------------------------------------

#[test]
fn bench_gov_update_fees_comparison() {
    println!("\n📊 Comparative Analysis: update_fees() variants");
    let setup = GovBenchSetup::new();
    
    // Benchmark single fee update
    let mut single_samples = Vec::with_capacity(ITERATIONS);
    for i in 0..ITERATIONS {
        let new_fee = 100_000_000 + (i as i128 * 1000);
        let cpu = measure_cpu(&setup.env, || {
            setup.client.update_fees(&setup.admin, &Some(new_fee), &None);
        });
        single_samples.push(cpu);
    }
    let single_stats = BenchmarkStats::from_samples(single_samples);
    
    // Benchmark both fees update
    let mut both_samples = Vec::with_capacity(ITERATIONS);
    for i in 0..ITERATIONS {
        let base_fee = 100_000_000 + (i as i128 * 1000);
        let metadata_fee = 50_000_000 + (i as i128 * 500);
        let cpu = measure_cpu(&setup.env, || {
            setup.client.update_fees(&setup.admin, &Some(base_fee), &Some(metadata_fee));
        });
        both_samples.push(cpu);
    }
    let both_stats = BenchmarkStats::from_samples(both_samples);
    
    println!("\n{}", "=".repeat(70));
    println!("Comparison: update_fees() Single vs Both");
    println!("{}", "=".repeat(70));
    println!("{:<30} {:>15} {:>15}", "Metric", "Single Fee", "Both Fees");
    println!("{}", "-".repeat(70));
    println!("{:<30} {:>15.2} {:>15.2}", "Average (CPU)", single_stats.avg, both_stats.avg);
    println!("{:<30} {:>15} {:>15}", "Min (CPU)", single_stats.min, both_stats.min);
    println!("{:<30} {:>15} {:>15}", "Max (CPU)", single_stats.max, both_stats.max);
    println!("{:<30} {:>15} {:>15}", "P95 (CPU)", single_stats.p95, both_stats.p95);
    
    let overhead = both_stats.avg - single_stats.avg;
    let overhead_pct = (overhead / single_stats.avg) * 100.0;
    println!("\n{:<30} {:>15.2} ({:.1}%)", "Overhead for 2nd fee", overhead, overhead_pct);
    println!("{}", "=".repeat(70));
}

#[test]
fn bench_gov_batch_vs_individual() {
    println!("\n📊 Comparative Analysis: batch_update_admin() vs individual calls");
    let setup = GovBenchSetup::new();
    
    // Benchmark batch update
    let mut batch_samples = Vec::with_capacity(ITERATIONS);
    for i in 0..ITERATIONS {
        let base_fee = 100_000_000 + (i as i128 * 1000);
        let metadata_fee = 50_000_000 + (i as i128 * 500);
        let paused = i % 2 == 0;
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.batch_update_admin(
                &setup.admin,
                &Some(base_fee),
                &Some(metadata_fee),
                &Some(paused),
            );
        });
        batch_samples.push(cpu);
    }
    let batch_stats = BenchmarkStats::from_samples(batch_samples);
    
    // Benchmark individual calls
    let mut individual_samples = Vec::with_capacity(ITERATIONS);
    for i in 0..ITERATIONS {
        let base_fee = 100_000_000 + (i as i128 * 1000);
        let metadata_fee = 50_000_000 + (i as i128 * 500);
        let paused = i % 2 == 0;
        
        let cpu = measure_cpu(&setup.env, || {
            setup.client.update_fees(&setup.admin, &Some(base_fee), &Some(metadata_fee));
            if paused {
                setup.client.pause(&setup.admin);
            } else {
                setup.client.unpause(&setup.admin);
            }
        });
        individual_samples.push(cpu);
    }
    let individual_stats = BenchmarkStats::from_samples(individual_samples);
    
    println!("\n{}", "=".repeat(70));
    println!("Comparison: Batch vs Individual Operations");
    println!("{}", "=".repeat(70));
    println!("{:<30} {:>15} {:>15}", "Metric", "Batch", "Individual");
    println!("{}", "-".repeat(70));
    println!("{:<30} {:>15.2} {:>15.2}", "Average (CPU)", batch_stats.avg, individual_stats.avg);
    println!("{:<30} {:>15} {:>15}", "Min (CPU)", batch_stats.min, individual_stats.min);
    println!("{:<30} {:>15} {:>15}", "Max (CPU)", batch_stats.max, individual_stats.max);
    println!("{:<30} {:>15} {:>15}", "P95 (CPU)", batch_stats.p95, individual_stats.p95);
    
    let savings = individual_stats.avg - batch_stats.avg;
    let savings_pct = (savings / individual_stats.avg) * 100.0;
    println!("\n{:<30} {:>15.2} ({:.1}%)", "Gas Savings (Batch)", savings, savings_pct);
    println!("{}", "=".repeat(70));
}

// ---------------------------------------------------------------------------
// Comprehensive Governance Report
// ---------------------------------------------------------------------------

#[test]
fn bench_gov_comprehensive_report() {
    println!("\n{}", "=".repeat(80));
    println!("Nova Launch - Governance Flows Gas Benchmark Report");
    println!("Soroban SDK: 21.0.0");
    println!("Iterations per test: {}", ITERATIONS);
    println!("Regression threshold: {:.0}%", REGRESSION_THRESHOLD * 100.0);
    println!("{}", "=".repeat(80));
    
    let setup = GovBenchSetup::new();
    
    // 1. Transfer Admin
    let mut transfer_admin_samples = Vec::with_capacity(ITERATIONS);
    for _ in 0..ITERATIONS {
        let new_setup = GovBenchSetup::new();
        let new_admin = Address::generate(&new_setup.env);
        let cpu = measure_cpu(&new_setup.env, || {
            new_setup.client.transfer_admin(&new_setup.admin, &new_admin);
        });
        transfer_admin_samples.push(cpu);
    }
    let transfer_admin_stats = BenchmarkStats::from_samples(transfer_admin_samples);
    
    // 2. Pause
    let mut pause_samples = Vec::with_capacity(ITERATIONS);
    for _ in 0..ITERATIONS {
        let new_setup = GovBenchSetup::new();
        let cpu = measure_cpu(&new_setup.env, || {
            new_setup.client.pause(&new_setup.admin);
        });
        pause_samples.push(cpu);
    }
    let pause_stats = BenchmarkStats::from_samples(pause_samples);
    
    // 3. Unpause
    let mut unpause_samples = Vec::with_capacity(ITERATIONS);
    for _ in 0..ITERATIONS {
        let new_setup = GovBenchSetup::new();
        new_setup.client.pause(&new_setup.admin);
        let cpu = measure_cpu(&new_setup.env, || {
            new_setup.client.unpause(&new_setup.admin);
        });
        unpause_samples.push(cpu);
    }
    let unpause_stats = BenchmarkStats::from_samples(unpause_samples);
    
    // 4. Update Fees (Single)
    let mut update_fees_single_samples = Vec::with_capacity(ITERATIONS);
    for i in 0..ITERATIONS {
        let cpu = measure_cpu(&setup.env, || {
            setup.client.update_fees(&setup.admin, &Some(100_000_000 + i as i128), &None);
        });
        update_fees_single_samples.push(cpu);
    }
    let update_fees_single_stats = BenchmarkStats::from_samples(update_fees_single_samples);
    
    // 5. Update Fees (Both)
    let mut update_fees_both_samples = Vec::with_capacity(ITERATIONS);
    for i in 0..ITERATIONS {
        let cpu = measure_cpu(&setup.env, || {
            setup.client.update_fees(
                &setup.admin,
                &Some(100_000_000 + i as i128),
                &Some(50_000_000 + i as i128),
            );
        });
        update_fees_both_samples.push(cpu);
    }
    let update_fees_both_stats = BenchmarkStats::from_samples(update_fees_both_samples);
    
    // 6. Batch Update Admin
    let mut batch_update_samples = Vec::with_capacity(ITERATIONS);
    for i in 0..ITERATIONS {
        let cpu = measure_cpu(&setup.env, || {
            setup.client.batch_update_admin(
                &setup.admin,
                &Some(100_000_000 + i as i128),
                &Some(50_000_000 + i as i128),
                &Some(i % 2 == 0),
            );
        });
        batch_update_samples.push(cpu);
    }
    let batch_update_stats = BenchmarkStats::from_samples(batch_update_samples);
    
    // 7. Set Clawback
    let mut set_clawback_samples = Vec::with_capacity(ITERATIONS);
    for _ in 0..ITERATIONS {
        let new_setup = GovBenchSetup::new();
        let creator = Address::generate(&new_setup.env);
        let token_index = new_setup.create_test_token(&creator);
        let token_info = crate::storage::get_token_info(&new_setup.env, token_index).unwrap();
        let cpu = measure_cpu(&new_setup.env, || {
            new_setup.client.set_clawback(&token_info.address, &creator, &true);
        });
        set_clawback_samples.push(cpu);
    }
    let set_clawback_stats = BenchmarkStats::from_samples(set_clawback_samples);
    
    // 8. Is Paused (Read-only)
    let mut is_paused_samples = Vec::with_capacity(ITERATIONS);
    for _ in 0..ITERATIONS {
        let cpu = measure_cpu(&setup.env, || {
            let _ = setup.client.is_paused();
        });
        is_paused_samples.push(cpu);
    }
    let is_paused_stats = BenchmarkStats::from_samples(is_paused_samples);
    
    // Print Summary Table
    println!("\n{}", "=".repeat(80));
    println!("GOVERNANCE OPERATIONS SUMMARY");
    println!("{}", "=".repeat(80));
    println!("{:<35} {:>10} {:>10} {:>10} {:>10}", 
        "Operation", "Avg", "Min", "Max", "P95");
    println!("{}", "-".repeat(80));
    
    let operations = vec![
        ("transfer_admin", &transfer_admin_stats),
        ("pause", &pause_stats),
        ("unpause", &unpause_stats),
        ("update_fees [single]", &update_fees_single_stats),
        ("update_fees [both]", &update_fees_both_stats),
        ("batch_update_admin", &batch_update_stats),
        ("set_clawback", &set_clawback_stats),
        ("is_paused [read-only]", &is_paused_stats),
    ];
    
    for (name, stats) in &operations {
        println!(
            "{:<35} {:>10.0} {:>10} {:>10} {:>10}",
            name, stats.avg, stats.min, stats.max, stats.p95
        );
    }
    
    println!("{}", "-".repeat(80));
    println!("\nAll values in CPU instructions");
    
    // Gas Efficiency Analysis
    println!("\n{}", "=".repeat(80));
    println!("GAS EFFICIENCY ANALYSIS");
    println!("{}", "=".repeat(80));
    
    let batch_savings = (update_fees_both_stats.avg + pause_stats.avg) - batch_update_stats.avg;
    let batch_savings_pct = (batch_savings / (update_fees_both_stats.avg + pause_stats.avg)) * 100.0;
    
    println!("\n1. Batch Operations Efficiency:");
    println!("   Individual calls (update_fees + pause): {:.0} CPU", 
        update_fees_both_stats.avg + pause_stats.avg);
    println!("   Batch call (batch_update_admin):       {:.0} CPU", batch_update_stats.avg);
    println!("   Savings:                                {:.0} CPU ({:.1}%)", 
        batch_savings, batch_savings_pct);
    
    let fee_overhead = update_fees_both_stats.avg - update_fees_single_stats.avg;
    let fee_overhead_pct = (fee_overhead / update_fees_single_stats.avg) * 100.0;
    
    println!("\n2. Fee Update Overhead:");
    println!("   Single fee update:  {:.0} CPU", update_fees_single_stats.avg);
    println!("   Both fees update:   {:.0} CPU", update_fees_both_stats.avg);
    println!("   Overhead:           {:.0} CPU ({:.1}%)", fee_overhead, fee_overhead_pct);
    
    println!("\n3. Read vs Write Operations:");
    println!("   Read (is_paused):   {:.0} CPU", is_paused_stats.avg);
    println!("   Write (pause):      {:.0} CPU", pause_stats.avg);
    let read_write_ratio = pause_stats.avg / is_paused_stats.avg;
    println!("   Write/Read ratio:   {:.1}x", read_write_ratio);
    
    // Baseline Update Recommendations
    println!("\n{}", "=".repeat(80));
    println!("BASELINE UPDATE RECOMMENDATIONS");
    println!("{}", "=".repeat(80));
    println!("Copy these values to update baseline constants:\n");
    println!("const BASELINE_TRANSFER_ADMIN_CPU: u64 = {:.0};", transfer_admin_stats.avg);
    println!("const BASELINE_PAUSE_CPU: u64 = {:.0};", pause_stats.avg);
    println!("const BASELINE_UNPAUSE_CPU: u64 = {:.0};", unpause_stats.avg);
    println!("const BASELINE_UPDATE_FEES_SINGLE_CPU: u64 = {:.0};", update_fees_single_stats.avg);
    println!("const BASELINE_UPDATE_FEES_BOTH_CPU: u64 = {:.0};", update_fees_both_stats.avg);
    println!("const BASELINE_BATCH_UPDATE_ADMIN_CPU: u64 = {:.0};", batch_update_stats.avg);
    println!("const BASELINE_SET_CLAWBACK_CPU: u64 = {:.0};", set_clawback_stats.avg);
    
    println!("\n{}", "=".repeat(80));
}

// ---------------------------------------------------------------------------
// Stress Test: Rapid Governance Changes
// ---------------------------------------------------------------------------

#[test]
fn bench_gov_stress_rapid_changes() {
    println!("\n🔥 Stress Test: Rapid Governance Changes");
    let setup = GovBenchSetup::new();
    let mut samples = Vec::with_capacity(ITERATIONS);
    
    for i in 0..ITERATIONS {
        let cpu = measure_cpu(&setup.env, || {
            // Rapid sequence of governance operations
            setup.client.update_fees(
                &setup.admin,
                &Some(100_000_000 + i as i128),
                &Some(50_000_000 + i as i128),
            );
            
            if i % 2 == 0 {
                setup.client.pause(&setup.admin);
            } else {
                setup.client.unpause(&setup.admin);
            }
            
            let _ = setup.client.is_paused();
        });
        
        samples.push(cpu);
    }
    
    let stats = BenchmarkStats::from_samples(samples);
    stats.print("Rapid Governance Changes (3 ops)");
    
    println!("\n  Average per operation: {:.2} CPU", stats.avg / 3.0);
}

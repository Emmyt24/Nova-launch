//! Gas Benchmarks for Token Create Operations
//!
//! This module provides comprehensive benchmarks for token creation operations,
//! measuring CPU and memory costs to detect regressions.
//!
//! Run benchmarks with:
//!   cargo test --package token-factory create_mint_bench -- --nocapture

#![cfg(test)]
extern crate std;

use std::format;
use std::println;
use std::vec;
use std::vec::Vec;

use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// ---------------------------------------------------------------------------
// Benchmark Configuration
// ---------------------------------------------------------------------------

const ITERATIONS: usize = 100;
const REGRESSION_THRESHOLD: f64 = 0.10; // 10% increase triggers warning

// Baseline values - update after running initial benchmarks
const BASELINE_CREATE_TOKEN_CPU: u64 = 162139;
const BASELINE_CREATE_TOKEN_MEM: u64 = 21456;
const BASELINE_BATCH_CREATE_5_CPU: u64 = 1589664;
const BASELINE_BATCH_CREATE_5_MEM: u64 = 260801;

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
    fn from_samples(samples: Vec<u64>) -> Self {
        // Convert to std::vec::Vec for sorting
        let mut sorted: Vec<u64> = samples.into_iter().collect();
        sorted.sort_unstable();
        let len = sorted.len();
        
        let min = sorted[0];
        let max = sorted[len - 1];
        let sum: u64 = sorted.iter().sum();
        let avg = sum as f64 / len as f64;
        
        let median = if len % 2 == 0 {
            (sorted[len / 2 - 1] + sorted[len / 2]) / 2
        } else {
            sorted[len / 2]
        };
        
        let p95_idx = (len as f64 * 0.95) as usize;
        let p99_idx = (len as f64 * 0.99) as usize;
        let p95 = sorted[p95_idx.min(len - 1)];
        let p99 = sorted[p99_idx.min(len - 1)];
        
        // Calculate standard deviation
        let variance: f64 = sorted
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
    
    fn check_regression(&self, baseline: u64, operation: &str, metric: &str) -> bool {
        if baseline == 0 {
            println!("  [INFO] No baseline set for {}_{}", operation, metric);
            return false;
        }
        
        let increase = (self.avg - baseline as f64) / baseline as f64;
        if increase > REGRESSION_THRESHOLD {
            println!(
                "  [REGRESSION] {}_{} increased by {:.1}% (threshold: {:.1}%)",
                operation,
                metric,
                increase * 100.0,
                REGRESSION_THRESHOLD * 100.0
            );
            return true;
        }
        false
    }
    
    fn print(&self, operation: &str) {
        println!("\n{}", "=".repeat(70));
        println!("Benchmark: {}", operation);
        println!("{}", "=".repeat(70));
        println!("  Iterations:     {}", ITERATIONS);
        println!("  Min:            {} CPU instructions", self.min);
        println!("  Max:            {} CPU instructions", self.max);
        println!("  Average:        {:.2} CPU instructions", self.avg);
        println!("  Median:         {} CPU instructions", self.median);
        println!("  95th percentile: {} CPU instructions", self.p95);
        println!("  99th percentile: {} CPU instructions", self.p99);
        println!("  Std Deviation:  {:.2}", self.std_dev);
    }
}

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

struct BenchSetup {
    env: Env,
    admin: Address,
    treasury: Address,
    creator: Address,
}

impl BenchSetup {
    fn new() -> Self {
        let env = Env::default();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let creator = Address::generate(&env);
        BenchSetup {
            env,
            admin,
            treasury,
            creator,
        }
    }

    fn initialized() -> (Self, Address) {
        let setup = BenchSetup::new();
        let contract_id = setup.env.register_contract(None, TokenFactory);
        let client = TokenFactoryClient::new(&setup.env, &contract_id);
        client.initialize(&setup.admin, &setup.treasury, &70_000_000, &30_000_000);
        (setup, contract_id)
    }
}

fn measure_both<F: FnOnce()>(env: &Env, f: F) -> (u64, u64) {
    env.budget().reset_unlimited();
    env.budget().reset_default();
    f();
    (
        env.budget().cpu_instruction_cost(),
        env.budget().memory_bytes_cost(),
    )
}

// ---------------------------------------------------------------------------
// Single Create Benchmark
// ---------------------------------------------------------------------------

#[test]
fn bench_single_create_token() {
    let mut cpu_samples = Vec::new();
    let mut mem_samples = Vec::new();
    
    for _ in 0..ITERATIONS {
        let (setup, contract_id) = BenchSetup::initialized();
        setup.env.mock_all_auths();
        let client = TokenFactoryClient::new(&setup.env, &contract_id);
        
        let (cpu, mem) = measure_both(&setup.env, || {
            let _ = client.create_token(
                &setup.creator,
                &String::from_str(&setup.env, "Test Token"),
                &String::from_str(&setup.env, "TEST"),
                &7,
                &1_000_000_000i128,
                &70_000_000,
            );
        });
        
        cpu_samples.push(cpu);
        mem_samples.push(mem);
    }
    
    let cpu_stats = BenchmarkStats::from_samples(cpu_samples);
    let mem_stats = BenchmarkStats::from_samples(mem_samples);
    
    cpu_stats.print("create_token() - Single");
    println!("  Memory Avg:     {:.2} bytes", mem_stats.avg);
    
    // Check for regressions
    cpu_stats.check_regression(BASELINE_CREATE_TOKEN_CPU, "create_token", "cpu");
    mem_stats.check_regression(BASELINE_CREATE_TOKEN_MEM, "create_token", "mem");
    
    assert!(cpu_stats.avg > 0.0, "Average CPU cost should be non-zero");
    assert!(mem_stats.avg > 0.0, "Average memory cost should be non-zero");
}

// ---------------------------------------------------------------------------
// Batch Create Benchmark (5 tokens)
// ---------------------------------------------------------------------------

#[test]
fn bench_batch_create_5() {
    let mut cpu_samples = Vec::new();
    let mut mem_samples = Vec::new();
    
    for _ in 0..ITERATIONS {
        let (setup, contract_id) = BenchSetup::initialized();
        setup.env.mock_all_auths();
        let client = TokenFactoryClient::new(&setup.env, &contract_id);
        
        let (cpu, mem) = measure_both(&setup.env, || {
            // Create 5 tokens in sequence (simulating batch)
            for i in 0..5 {
                let name = String::from_str(&setup.env, &format!("Token {}", i));
                let symbol = String::from_str(&setup.env, &format!("TK{}", i));
                let _ = client.create_token(
                    &setup.creator,
                    &name,
                    &symbol,
                    &7,
                    &1_000_000_000i128,
                    &70_000_000,
                );
            }
        });
        
        cpu_samples.push(cpu);
        mem_samples.push(mem);
    }
    
    let cpu_stats = BenchmarkStats::from_samples(cpu_samples);
    let mem_stats = BenchmarkStats::from_samples(mem_samples);
    
    cpu_stats.print("create_token() - Batch 5");
    println!("  Memory Avg:     {:.2} bytes", mem_stats.avg);
    println!("  Per-token CPU:  {:.2} CPU instructions", cpu_stats.avg / 5.0);
    
    // Check for regressions
    cpu_stats.check_regression(BASELINE_BATCH_CREATE_5_CPU, "batch_create_5", "cpu");
    mem_stats.check_regression(BASELINE_BATCH_CREATE_5_MEM, "batch_create_5", "mem");
    
    assert!(cpu_stats.avg > 0.0, "Average CPU cost should be non-zero");
    assert!(mem_stats.avg > 0.0, "Average memory cost should be non-zero");
}

// ---------------------------------------------------------------------------
// Comprehensive Baseline Report
// ---------------------------------------------------------------------------

#[test]
fn bench_create_baseline_report() {
    println!("\n{}", "=".repeat(80));
    println!("Nova Launch Token Factory - Create Gas Benchmark Report");
    println!("Soroban SDK: 21.0.0");
    println!("Iterations per test: {}", ITERATIONS);
    println!("Regression threshold: {:.0}%", REGRESSION_THRESHOLD * 100.0);
    println!("{}", "=".repeat(80));
    
    // Single create
    let mut create_samples = Vec::new();
    let mut create_mem_samples = Vec::new();
    
    for _ in 0..ITERATIONS {
        let (setup, contract_id) = BenchSetup::initialized();
        setup.env.mock_all_auths();
        let client = TokenFactoryClient::new(&setup.env, &contract_id);
        
        let (cpu, mem) = measure_both(&setup.env, || {
            let _ = client.create_token(
                &setup.creator,
                &String::from_str(&setup.env, "Report Token"),
                &String::from_str(&setup.env, "RPT"),
                &7,
                &1_000_000_000i128,
                &70_000_000,
            );
        });
        
        create_samples.push(cpu);
        create_mem_samples.push(mem);
    }
    
    let create_stats = BenchmarkStats::from_samples(create_samples);
    let create_mem_stats = BenchmarkStats::from_samples(create_mem_samples);
    
    // Batch create (5)
    let mut batch_create_samples = Vec::new();
    let mut batch_create_mem_samples = Vec::new();
    
    for _ in 0..ITERATIONS {
        let (setup, contract_id) = BenchSetup::initialized();
        setup.env.mock_all_auths();
        let client = TokenFactoryClient::new(&setup.env, &contract_id);
        
        let (cpu, mem) = measure_both(&setup.env, || {
            for i in 0..5 {
                let name = String::from_str(&setup.env, &format!("BToken {}", i));
                let symbol = String::from_str(&setup.env, &format!("BTK{}", i));
                let _ = client.create_token(
                    &setup.creator,
                    &name,
                    &symbol,
                    &7,
                    &1_000_000_000i128,
                    &70_000_000,
                );
            }
        });
        
        batch_create_samples.push(cpu);
        batch_create_mem_samples.push(mem);
    }
    
    let batch_create_stats = BenchmarkStats::from_samples(batch_create_samples);
    let batch_create_mem_stats = BenchmarkStats::from_samples(batch_create_mem_samples);
    
    // Print Summary Table
    println!("\n{:<30} {:>12} {:>12} {:>12} {:>12} {:>12}", 
        "Operation", "Avg CPU", "Min CPU", "Max CPU", "P95 CPU", "P99 CPU");
    println!("{}", "-".repeat(90));
    
    println!(
        "{:<30} {:>12.0} {:>12} {:>12} {:>12} {:>12}",
        "create_token (single)", create_stats.avg, create_stats.min, create_stats.max, create_stats.p95, create_stats.p99
    );
    println!(
        "{:<30} {:>12.0} {:>12} {:>12} {:>12} {:>12}",
        "create_token (batch 5)", batch_create_stats.avg, batch_create_stats.min, batch_create_stats.max, batch_create_stats.p95, batch_create_stats.p99
    );
    
    println!("{}", "-".repeat(90));
    println!("\n{:<30} {:>12} {:>12}", 
        "Operation", "Avg Mem", "Per-Op");
    println!("{}", "-".repeat(60));
    println!(
        "{:<30} {:>12.0} {:>12.0}",
        "create_token (single)", create_mem_stats.avg, create_mem_stats.avg
    );
    println!(
        "{:<30} {:>12.0} {:>12.0}",
        "create_token (batch 5)", batch_create_mem_stats.avg, batch_create_mem_stats.avg / 5.0
    );
    
    println!("\n{}", "=".repeat(80));
    println!("BASELINE VALUES - Copy these to constants in the benchmark file:");
    println!("{}", "=".repeat(80));
    println!("// CPU Baselines");
    println!("const BASELINE_CREATE_TOKEN_CPU: u64 = {:.0};", create_stats.avg);
    println!("const BASELINE_BATCH_CREATE_5_CPU: u64 = {:.0};", batch_create_stats.avg);
    println!();
    println!("// Memory Baselines");
    println!("const BASELINE_CREATE_TOKEN_MEM: u64 = {:.0};", create_mem_stats.avg);
    println!("const BASELINE_BATCH_CREATE_5_MEM: u64 = {:.0};", batch_create_mem_stats.avg);
    println!("{}", "=".repeat(80));
    
    // Verify against existing baselines
    println!("\n{}", "=".repeat(80));
    println!("REGRESSION CHECK:");
    println!("{}", "=".repeat(80));
    let _ = create_stats.check_regression(BASELINE_CREATE_TOKEN_CPU, "create_token", "cpu");
    let _ = create_mem_stats.check_regression(BASELINE_CREATE_TOKEN_MEM, "create_token", "mem");
    let _ = batch_create_stats.check_regression(BASELINE_BATCH_CREATE_5_CPU, "batch_create_5", "cpu");
    let _ = batch_create_mem_stats.check_regression(BASELINE_BATCH_CREATE_5_MEM, "batch_create_5", "mem");
}

// ---------------------------------------------------------------------------
// Comparison Tests
// ---------------------------------------------------------------------------

#[test]
fn bench_comparison_individual_vs_batch_create() {
    let (setup, contract_id) = BenchSetup::initialized();
    setup.env.mock_all_auths();
    let client = TokenFactoryClient::new(&setup.env, &contract_id);
    
    // Individual creates
    let (cpu_individual, mem_individual) = measure_both(&setup.env, || {
        for i in 0..5 {
            let name = String::from_str(&setup.env, &format!("IndToken {}", i));
            let symbol = String::from_str(&setup.env, &format!("IND{}", i));
            let _ = client.create_token(
                &setup.creator,
                &name,
                &symbol,
                &7,
                &1_000_000_000i128,
                &70_000_000,
            );
        }
    });
    
    // Batch create (same 5 tokens, measured together)
    let (cpu_batch, mem_batch) = measure_both(&setup.env, || {
        for i in 0..5 {
            let name = String::from_str(&setup.env, &format!("BatchToken {}", i));
            let symbol = String::from_str(&setup.env, &format!("BAT{}", i));
            let _ = client.create_token(
                &setup.creator,
                &name,
                &symbol,
                &7,
                &1_000_000_000i128,
                &70_000_000,
            );
        }
    });
    
    let cpu_savings = ((cpu_individual as f64 - cpu_batch as f64) / cpu_individual as f64) * 100.0;
    let mem_savings = ((mem_individual as f64 - mem_batch as f64) / mem_individual as f64) * 100.0;
    
    println!("\n=== Create Operation Comparison (5 tokens) ===");
    println!("Individual (5 separate): CPU: {}, Memory: {}", cpu_individual, mem_individual);
    println!("Batch (measured together): CPU: {}, Memory: {}", cpu_batch, mem_batch);
    println!("Note: These should be similar since no native batching exists yet");
    println!("CPU Savings: {:.2}%", cpu_savings);
    println!("Memory Savings: {:.2}%", mem_savings);
}

// ---------------------------------------------------------------------------
// Regression Detection Tests
// ---------------------------------------------------------------------------

#[test]
fn test_regression_detection_cpu() {
    // This test demonstrates how regression detection works for CPU
    // Use samples that give > 10% increase (avg = 112)
    let samples = vec![100u64, 105, 115, 120, 120]; // Simulated samples
    let stats = BenchmarkStats::from_samples(samples);
    
    // Test with baseline of 100
    let baseline = 100u64;
    let has_regression = stats.check_regression(baseline, "test_op", "cpu");
    
    // 112 avg vs 100 baseline = 12% increase, should trigger
    assert!(has_regression, "Should detect >10% CPU regression");
}

#[test]
fn test_no_regression_cpu() {
    let samples = vec![100u64, 102, 104, 106, 108]; // Simulated samples
    let stats = BenchmarkStats::from_samples(samples);
    
    // Test with baseline of 100
    let baseline = 100u64;
    let has_regression = stats.check_regression(baseline, "test_op", "cpu");
    
    // 104 avg vs 100 baseline = 4% increase, should not trigger
    assert!(!has_regression, "Should not detect regression under threshold");
}

#[test]
fn test_regression_detection_memory() {
    // This test demonstrates how regression detection works for memory
    // Use samples that give > 10% increase (avg = 1120)
    let samples = vec![1000u64, 1050, 1150, 1200, 1200]; // Simulated samples
    let stats = BenchmarkStats::from_samples(samples);
    
    // Test with baseline of 1000
    let baseline = 1000u64;
    let has_regression = stats.check_regression(baseline, "test_op", "mem");
    
    // 1120 avg vs 1000 baseline = 12% increase, should trigger
    assert!(has_regression, "Should detect >10% memory regression");
}

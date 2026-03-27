// Gas Optimization Benchmarks for Burn Operations
// Issue #154

#[cfg(test)]
use crate::{TokenFactory, TokenFactoryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn bench_single_burn() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    let user = Address::generate(&env);

    let factory = TokenFactoryClient::new(&env, &env.register_contract(None, TokenFactory));
    factory.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    let token_address = factory.create_token(
        &creator,
        &String::from_str(&env, "Bench Token"),
        &String::from_str(&env, "BENCH"),
        &7,
        &100_000_000,
        &None,
        &70_000_000,
    );

    // Reset budget for accurate measurement
    env.budget().reset_unlimited();

    factory.burn(&token_address, &user, &1_000_000);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    #[cfg(test)]
    std::println!("Single burn - CPU: {}, Memory: {}", cpu, mem);
}

#[test]
fn bench_batch_burn_2() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let factory = TokenFactoryClient::new(&env, &env.register_contract(None, TokenFactory));
    factory.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    let token_address = factory.create_token(
        &creator,
        &String::from_str(&env, "Batch Token"),
        &String::from_str(&env, "BATCH"),
        &7,
        &100_000_000,
        &None,
        &70_000_000,
    );

    let burns = soroban_sdk::vec![
        &env,
        (user1.clone(), 1_000_000),
        (user2.clone(), 1_000_000),
    ];

    env.budget().reset_unlimited();

    factory.burn_batch(&token_address, &burns);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    #[cfg(test)]
    std::println!("Batch burn (2) - CPU: {}, Memory: {}", cpu, mem);
}

#[test]
fn bench_batch_burn_5() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    let factory = TokenFactoryClient::new(&env, &env.register_contract(None, TokenFactory));
    factory.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    let token_address = factory.create_token(
        &creator,
        &String::from_str(&env, "Batch Token"),
        &String::from_str(&env, "BATCH"),
        &7,
        &100_000_000,
        &None,
        &70_000_000,
    );

    let burns = soroban_sdk::vec![
        &env,
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
    ];

    env.budget().reset_unlimited();

    factory.burn_batch(&token_address, &burns);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    #[cfg(test)]
    std::println!("Batch burn (5) - CPU: {}, Memory: {}", cpu, mem);
}

#[test]
fn bench_batch_burn_10() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    let factory = TokenFactoryClient::new(&env, &env.register_contract(None, TokenFactory));
    factory.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    let token_address = factory.create_token(
        &creator,
        &String::from_str(&env, "Batch Token"),
        &String::from_str(&env, "BATCH"),
        &7,
        &100_000_000,
        &None,
        &70_000_000,
    );

    let burns = soroban_sdk::vec![
        &env,
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
    ];

    env.budget().reset_unlimited();

    factory.burn_batch(&token_address, &burns);

    let cpu = env.budget().cpu_instruction_cost();
    let mem = env.budget().memory_bytes_cost();

    #[cfg(test)]
    std::println!("Batch burn (10) - CPU: {}, Memory: {}", cpu, mem);
}

#[test]
fn bench_comparison_individual_vs_batch() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);

    let factory = TokenFactoryClient::new(&env, &env.register_contract(None, TokenFactory));
    factory.initialize(&admin, &treasury, &70_000_000, &30_000_000);

    // Test individual burns
    let token1 = factory.create_token(
        &creator,
        &String::from_str(&env, "Individual"),
        &String::from_str(&env, "IND"),
        &7,
        &100_000_000,
        &None,
        &70_000_000,
    );

    env.budget().reset_unlimited();

    for _ in 0..5 {
        let user = Address::generate(&env);
        factory.burn(&token1, &user, &1_000_000);
    }

    let cpu_individual = env.budget().cpu_instruction_cost();
    let mem_individual = env.budget().memory_bytes_cost();

    // Test batch burn
    let token2 = factory.create_token(
        &creator,
        &String::from_str(&env, "Batch"),
        &String::from_str(&env, "BAT"),
        &7,
        &100_000_000,
        &None,
        &70_000_000,
    );

    let burns = soroban_sdk::vec![
        &env,
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
        (Address::generate(&env), 1_000_000),
    ];

    env.budget().reset_unlimited();

    factory.burn_batch(&token2, &burns);

    let cpu_batch = env.budget().cpu_instruction_cost();
    let mem_batch = env.budget().memory_bytes_cost();

    let cpu_savings = ((cpu_individual - cpu_batch) as f64 / cpu_individual as f64) * 100.0;
    let mem_savings = ((mem_individual - mem_batch) as f64 / mem_individual as f64) * 100.0;

    #[cfg(test)]
    std::println!("\n=== Gas Optimization Results ===");
    #[cfg(test)]
    std::println!("5 Individual burns - CPU: {}, Memory: {}", cpu_individual, mem_individual);
    #[cfg(test)]
    std::println!("1 Batch burn (5)   - CPU: {}, Memory: {}", cpu_batch, mem_batch);
    #[cfg(test)]
    std::println!("CPU Savings: {:.2}%", cpu_savings);
    #[cfg(test)]
    std::println!("Memory Savings: {:.2}%", mem_savings);
}

#!/usr/bin/env tsx
import { config } from 'dotenv';
import { DeploymentOrchestrator } from './orchestrator.js';
import { DEFAULT_CONFIG } from './types.js';
import type { DeploymentConfig } from './types.js';

// Load environment variables
config();

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<DeploymentConfig> {
  const args = process.argv.slice(2);
  const config: Partial<DeploymentConfig> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--network':
        config.network = value as 'testnet' | 'mainnet';
        break;
      case '--admin-key':
        config.adminKeyName = value;
        break;
      case '--treasury-key':
        config.treasuryKeyName = value;
        break;
      case '--base-fee':
        config.baseFee = parseInt(value);
        break;
      case '--metadata-fee':
        config.metadataFee = parseInt(value);
        break;
      case '--wasm-path':
        config.wasmPath = value;
        break;
      case '--env-file':
        config.envFile = value;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return config;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Nova Launch Contract Deployment Orchestrator

Usage: npm run deploy [options]

Options:
  --network <testnet|mainnet>  Target network (default: testnet)
  --admin-key <name>           Admin key name (default: admin)
  --treasury-key <name>        Treasury key name (default: treasury)
  --base-fee <amount>          Base fee in stroops (default: 70000000)
  --metadata-fee <amount>      Metadata fee in stroops (default: 30000000)
  --wasm-path <path>           Path to WASM file
  --env-file <path>            Environment file path
  --help, -h                   Show this help message

Examples:
  npm run deploy
  npm run deploy -- --network mainnet
  npm run deploy -- --network testnet --base-fee 50000000
`);
}

/**
 * Main deployment function
 */
async function main(): Promise<void> {
  try {
    const args = parseArgs();
    const config: DeploymentConfig = { ...DEFAULT_CONFIG, ...args };

    // Validate network-specific configuration
    if (config.network === 'mainnet') {
      config.horizonUrl = 'https://horizon.stellar.org';
      config.sorobanRpcUrl = 'https://soroban-mainnet.stellar.org';
      config.envFile = '../../.env.mainnet';
    }

    console.log('🔧 Deployment Configuration:');
    console.log(`   Network: ${config.network}`);
    console.log(`   Admin Key: ${config.adminKeyName}`);
    console.log(`   Treasury Key: ${config.treasuryKeyName}`);
    console.log(`   Base Fee: ${config.baseFee} stroops`);
    console.log(`   Metadata Fee: ${config.metadataFee} stroops`);
    console.log('');

    const orchestrator = new DeploymentOrchestrator(config);
    const result = await orchestrator.deploy();

    console.log('');
    console.log('📋 Deployment Summary:');
    console.log(`   Contract ID: ${result.contractId}`);
    console.log(`   Admin: ${result.admin}`);
    console.log(`   Treasury: ${result.treasury}`);
    console.log(`   Network: ${result.network}`);
    console.log(`   Deployed At: ${result.deployedAt}`);
    console.log(`   WASM Hash: ${result.wasmHash}`);
    console.log('');
    console.log('✅ Deployment completed successfully!');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
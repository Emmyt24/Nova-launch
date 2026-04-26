#!/usr/bin/env tsx
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DeploymentOrchestrator } from './orchestrator.js';
import { DEFAULT_CONFIG } from './types.js';
import type { DeploymentConfig, DeploymentResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
config();

/**
 * Parse command line arguments
 */
function parseArgs(): { contractId?: string; network?: string; help?: boolean } {
  const args = process.argv.slice(2);
  const parsed: { contractId?: string; network?: string; help?: boolean } = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--contract-id':
        parsed.contractId = value;
        break;
      case '--network':
        parsed.network = value;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Nova Launch Contract Verification Tool

Usage: npm run verify [options]

Options:
  --contract-id <id>           Contract ID to verify (auto-detected if not provided)
  --network <testnet|mainnet>  Target network (default: testnet)
  --help, -h                   Show this help message

Examples:
  npm run verify
  npm run verify -- --network mainnet
  npm run verify -- --contract-id CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
`);
}

/**
 * Load deployment info from files
 */
function loadDeploymentInfo(network: string): DeploymentResult | null {
  // Try deployments.json first
  const deploymentsPath = join(__dirname, '../../deployments.json');
  if (existsSync(deploymentsPath)) {
    try {
      const deployments = JSON.parse(readFileSync(deploymentsPath, 'utf8'));
      if (deployments[network]) {
        return deployments[network];
      }
    } catch (error) {
      console.warn('Failed to read deployments.json:', error);
    }
  }

  // Fallback to legacy deployment-testnet.json
  if (network === 'testnet') {
    const legacyPath = join(__dirname, '../../deployment-testnet.json');
    if (existsSync(legacyPath)) {
      try {
        const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'));
        return {
          contractId: legacy.contractId,
          admin: legacy.admin,
          treasury: legacy.treasury,
          network: legacy.network,
          deployedAt: legacy.deployedAt,
          transactionHash: 'unknown',
          wasmHash: 'unknown'
        };
      } catch (error) {
        console.warn('Failed to read deployment-testnet.json:', error);
      }
    }
  }

  return null;
}

/**
 * Main verification function
 */
async function main(): Promise<void> {
  try {
    const args = parseArgs();

    if (args.help) {
      printUsage();
      process.exit(0);
    }

    const network = args.network || 'testnet';
    let contractId = args.contractId;

    // Auto-detect contract ID if not provided
    if (!contractId) {
      const deploymentInfo = loadDeploymentInfo(network);
      if (!deploymentInfo) {
        console.error(`❌ No deployment found for network '${network}'. Deploy the contract first or provide --contract-id.`);
        process.exit(1);
      }
      contractId = deploymentInfo.contractId;
      console.log(`🔍 Auto-detected contract ID: ${contractId}`);
    }

    // Validate contract ID format
    if (!contractId.match(/^C[A-Z2-7]{55}$/)) {
      console.error(`❌ Invalid contract ID format: ${contractId}`);
      console.error('   Expected a 56-character Soroban contract ID starting with "C"');
      process.exit(1);
    }

    const config: DeploymentConfig = { ...DEFAULT_CONFIG };
    config.network = network as 'testnet' | 'mainnet';

    if (config.network === 'mainnet') {
      config.horizonUrl = 'https://horizon.stellar.org';
      config.sorobanRpcUrl = 'https://soroban-mainnet.stellar.org';
    }

    console.log('🔧 Verification Configuration:');
    console.log(`   Network: ${config.network}`);
    console.log(`   Contract ID: ${contractId}`);
    console.log('');

    const orchestrator = new DeploymentOrchestrator(config);
    const result = await orchestrator.verify(contractId);

    console.log('📋 Verification Results:');
    console.log(`   Contract ID: ${result.contractId}`);
    console.log(`   Valid: ${result.isValid ? '✅' : '❌'}`);
    console.log(`   WASM Hash Match: ${result.wasmHashMatch ? '✅' : '❌'}`);
    console.log(`   State Valid: ${result.stateValid ? '✅' : '❌'}`);

    if (result.errors.length > 0) {
      console.log('');
      console.log('❌ Errors:');
      result.errors.forEach(error => console.log(`   - ${error}`));
    }

    console.log('');
    if (result.isValid) {
      console.log('✅ Contract verification passed!');
    } else {
      console.log('❌ Contract verification failed!');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
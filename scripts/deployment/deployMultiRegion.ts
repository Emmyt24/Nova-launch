#!/usr/bin/env tsx
/**
 * Multi-region deployment CLI entry point.
 *
 * Usage:
 *   ./scripts/deploy-multi-region.sh
 *   tsx scripts/deployment/deployMultiRegion.ts [options]
 *
 * Options:
 *   --network <testnet|mainnet>  Target network (default: testnet)
 *   --sequential                 Deploy regions one-by-one instead of in parallel
 *   --regions <id,id,...>        Comma-separated region IDs to deploy (default: all)
 *   --help, -h                   Show this help
 */

import { config } from 'dotenv';
import { deployMultiRegion } from './multiRegionOrchestrator.js';
import { TESTNET_REGIONS, MAINNET_REGIONS } from './multiRegionTypes.js';
import type { RegionConfig, StellarNetwork } from './multiRegionTypes.js';

config();

function printUsage(): void {
  console.log(`
Nova Launch Multi-Region Deployment

Usage: tsx deployMultiRegion.ts [options]

Options:
  --network <testnet|mainnet>  Target network (default: testnet)
  --sequential                 Deploy regions sequentially (default: parallel)
  --regions <id,id,...>        Comma-separated region IDs to include
  --help, -h                   Show this help

Examples:
  tsx deployMultiRegion.ts
  tsx deployMultiRegion.ts --network mainnet
  tsx deployMultiRegion.ts --network mainnet --regions mainnet-us-east,mainnet-eu-west
  tsx deployMultiRegion.ts --sequential
`);
}

function parseArgs(): { network: StellarNetwork; parallel: boolean; regionIds?: string[] } {
  const args = process.argv.slice(2);
  let network: StellarNetwork = 'testnet';
  let parallel = true;
  let regionIds: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--network':
        network = args[++i] as StellarNetwork;
        break;
      case '--sequential':
        parallel = false;
        break;
      case '--regions':
        regionIds = args[++i].split(',').map((s) => s.trim());
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return { network, parallel, regionIds };
}

async function main(): Promise<void> {
  const { network, parallel, regionIds } = parseArgs();

  const allRegions: RegionConfig[] = network === 'mainnet' ? MAINNET_REGIONS : TESTNET_REGIONS;
  const regions = regionIds
    ? allRegions.filter((r) => regionIds.includes(r.id))
    : allRegions;

  if (regions.length === 0) {
    console.error(`❌ No matching regions found for network="${network}"`);
    process.exit(1);
  }

  const result = await deployMultiRegion(regions, parallel);

  console.log('\n📋 Multi-Region Deployment Summary:');
  console.log(`   Started:   ${result.startedAt}`);
  console.log(`   Completed: ${result.completedAt}`);
  console.log(`   Succeeded: ${result.successCount}/${regions.length}`);
  console.log('');

  for (const r of result.regions) {
    if (r.success) {
      console.log(`   ✅ ${r.regionId}: ${r.result!.contractId}`);
    } else {
      console.log(`   ❌ ${r.regionId}: ${r.error}`);
    }
  }

  if (!result.allSucceeded) {
    console.error('\n❌ One or more regions failed. Check errors above.');
    process.exit(1);
  }

  console.log('\n🎉 All regions deployed successfully!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

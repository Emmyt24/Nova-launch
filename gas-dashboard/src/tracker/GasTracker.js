import { SorobanRpc, Contract, Keypair, TransactionBuilder, Networks, Operation } from '@stellar/stellar-sdk';
import fs from 'fs/promises';
import path from 'path';

const RPC_URL = process.env.SOROBAN_RPC_URL;
const CONTRACT_ID = process.env.CONTRACT_ID;

class GasTracker {
  constructor() {
    this.server = new SorobanRpc.Server(RPC_URL);
    this.contract = new Contract(CONTRACT_ID);
  }

  async measureFunction(functionName, params) {
    try {
      const account = await this.server.getAccount(params.source);
      
      const transaction = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: Networks.TESTNET
      })
        .addOperation(this.contract.call(functionName, ...params.args))
        .setTimeout(30)
        .build();

      const simulation = await this.server.simulateTransaction(transaction);
      
      return {
        function: functionName,
        cpuInstructions: simulation.cost?.cpuInsns || 0,
        memBytes: simulation.cost?.memBytes || 0,
        timestamp: new Date().toISOString(),
        success: simulation.results?.[0]?.auth?.length >= 0
      };
    } catch (error) {
      console.error(`Error measuring ${functionName}:`, error);
      return null;
    }
  }

  async measureAllFunctions() {
    const functions = [
      { name: 'create_stream', params: this.getCreateStreamParams() },
      { name: 'withdraw', params: this.getWithdrawParams() },
      { name: 'cancel_stream', params: this.getCancelParams() },
      { name: 'pause_stream', params: this.getPauseParams() }
    ];

    const results = [];
    for (const fn of functions) {
      const result = await this.measureFunction(fn.name, fn.params);
      if (result) results.push(result);
    }

    return results;
  }

  async saveMeasurements(measurements) {
    const date = new Date().toISOString().split('T')[0];
    const filepath = path.join(process.cwd(), 'data', 'measurements', `${date}.json`);
    
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(measurements, null, 2));
    
    console.log(`Measurements saved to ${filepath}`);
  }

  async calculateMetrics(measurements) {
    const avgGas = measurements.reduce((sum, m) => sum + m.cpuInstructions, 0) / measurements.length;
    const totalMem = measurements.reduce((sum, m) => sum + m.memBytes, 0);
    
    return {
      avgGasPerTx: Math.round(avgGas),
      totalMemory: totalMem,
      functionCount: measurements.length,
      timestamp: new Date().toISOString()
    };
  }

  getCreateStreamParams() {
    return {
      source: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      args: [
        /* sender */ 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        /* receiver */ 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        /* token */ 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        /* amount */ 1000000,
        /* start_time */ Math.floor(Date.now() / 1000),
        /* cliff_time */ Math.floor(Date.now() / 1000) + 86400,
        /* end_time */ Math.floor(Date.now() / 1000) + 604800
      ]
    };
  }

  getWithdrawParams() {
    return {
      source: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      args: [
        /* stream_id */ 1,
        /* receiver */ 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      ]
    };
  }

  getCancelParams() {
    return {
      source: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      args: [
        /* stream_id */ 1
      ]
    };
  }

  getPauseParams() {
    return {
      source: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      args: [
        /* stream_id */ 1
      ]
    };
  }
}

export default GasTracker;

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const tracker = new GasTracker();
  const measurements = await tracker.measureAllFunctions();
  await tracker.saveMeasurements(measurements);
  const metrics = await tracker.calculateMetrics(measurements);
  console.log('Metrics:', metrics);
}

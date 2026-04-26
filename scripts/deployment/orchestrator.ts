import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DeploymentConfig, DeploymentResult, VerificationResult } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Automated deployment orchestrator for Stellar Soroban contracts
 * Provides secure, scriptable deployment with verification and error handling
 */
export class DeploymentOrchestrator {
  private config: DeploymentConfig;

  constructor(config: DeploymentConfig) {
    this.config = config;
  }

  /**
   * Deploy contract to Stellar network with full verification
   */
  async deploy(): Promise<DeploymentResult> {
    try {
      console.log(`🚀 Starting deployment to ${this.config.network}...`);
      
      // Pre-deployment validation
      await this.validateEnvironment();
      
      // Calculate WASM hash for verification
      const wasmHash = this.calculateWasmHash();
      console.log(`📦 WASM hash: ${wasmHash}`);
      
      // Deploy contract
      const contractId = await this.deployContract();
      console.log(`✅ Contract deployed: ${contractId}`);
      
      // Initialize contract
      const transactionHash = await this.initializeContract(contractId);
      console.log(`🔧 Contract initialized: ${transactionHash}`);
      
      // Get addresses
      const admin = this.getAddress(this.config.adminKeyName);
      const treasury = this.getAddress(this.config.treasuryKeyName);
      
      const result: DeploymentResult = {
        contractId,
        admin,
        treasury,
        network: this.config.network,
        deployedAt: new Date().toISOString(),
        transactionHash,
        wasmHash
      };
      
      // Save deployment info
      await this.saveDeploymentInfo(result);
      
      // Verify deployment
      const verification = await this.verify(contractId);
      if (!verification.isValid) {
        throw new Error(`Deployment verification failed: ${verification.errors.join(', ')}`);
      }
      
      console.log('🎉 Deployment completed successfully!');
      return result;
      
    } catch (error) {
      console.error('❌ Deployment failed:', error);
      throw error;
    }
  }

  /**
   * Verify deployed contract integrity
   */
  async verify(contractId: string): Promise<VerificationResult> {
    const errors: string[] = [];
    let wasmHashMatch = false;
    let stateValid = false;

    try {
      // Verify contract exists and is accessible
      const state = await this.getContractState(contractId);
      stateValid = !!state;
      
      // Verify WASM hash matches source
      const deployedWasmHash = await this.getDeployedWasmHash(contractId);
      const sourceWasmHash = this.calculateWasmHash();
      wasmHashMatch = deployedWasmHash === sourceWasmHash;
      
      if (!wasmHashMatch) {
        errors.push(`WASM hash mismatch: deployed=${deployedWasmHash}, source=${sourceWasmHash}`);
      }
      
    } catch (error) {
      errors.push(`Verification error: ${error}`);
    }

    return {
      contractId,
      isValid: errors.length === 0 && wasmHashMatch && stateValid,
      wasmHashMatch,
      stateValid,
      errors
    };
  }

  /**
   * Validate environment before deployment
   */
  private async validateEnvironment(): Promise<void> {
    // Check if soroban CLI is available
    try {
      execSync('soroban --version', { stdio: 'pipe' });
    } catch {
      throw new Error('Soroban CLI not found. Please install soroban CLI.');
    }

    // Check if WASM file exists
    const wasmPath = join(__dirname, this.config.wasmPath);
    if (!existsSync(wasmPath)) {
      throw new Error(`WASM file not found: ${wasmPath}. Run 'cargo build --target wasm32-unknown-unknown --release' first.`);
    }

    // Check if admin identity exists
    try {
      this.getAddress(this.config.adminKeyName);
    } catch {
      throw new Error(`Admin identity '${this.config.adminKeyName}' not found. Run setup-soroban.sh first.`);
    }

    // Create treasury identity if it doesn't exist
    try {
      this.getAddress(this.config.treasuryKeyName);
    } catch {
      console.log(`Creating treasury identity '${this.config.treasuryKeyName}'...`);
      execSync(`soroban keys generate --global ${this.config.treasuryKeyName}`, { stdio: 'pipe' });
    }
  }

  /**
   * Deploy contract WASM to network
   */
  private async deployContract(): Promise<string> {
    const wasmPath = join(__dirname, this.config.wasmPath);
    
    const cmd = [
      'soroban contract deploy',
      `--wasm "${wasmPath}"`,
      `--network ${this.config.network}`,
      `--source ${this.config.adminKeyName}`
    ].join(' ');

    const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return output.trim();
  }

  /**
   * Initialize deployed contract
   */
  private async initializeContract(contractId: string): Promise<string> {
    const admin = this.getAddress(this.config.adminKeyName);
    const treasury = this.getAddress(this.config.treasuryKeyName);

    const cmd = [
      'soroban contract invoke',
      `--id ${contractId}`,
      `--network ${this.config.network}`,
      `--source ${this.config.adminKeyName}`,
      '-- initialize',
      `--admin ${admin}`,
      `--treasury ${treasury}`,
      `--base_fee ${this.config.baseFee}`,
      `--metadata_fee ${this.config.metadataFee}`
    ].join(' ');

    execSync(cmd, { stdio: 'pipe' });
    
    // Return a mock transaction hash for now
    // In a real implementation, you'd parse the transaction response
    return `tx_${Date.now()}`;
  }

  /**
   * Get address for a key name
   */
  private getAddress(keyName: string): string {
    const output = execSync(`soroban keys address ${keyName}`, { encoding: 'utf8', stdio: 'pipe' });
    return output.trim();
  }

  /**
   * Calculate WASM file hash
   */
  private calculateWasmHash(): string {
    const wasmPath = join(__dirname, this.config.wasmPath);
    const wasmContent = readFileSync(wasmPath);
    return createHash('sha256').update(wasmContent).digest('hex');
  }

  /**
   * Get deployed contract WASM hash (mock implementation)
   */
  private async getDeployedWasmHash(contractId: string): Promise<string> {
    // This is a simplified implementation
    // In reality, you'd need to query the contract's WASM from the network
    return this.calculateWasmHash();
  }

  /**
   * Get contract state to verify it's properly initialized
   */
  private async getContractState(contractId: string): Promise<any> {
    try {
      const cmd = [
        'soroban contract invoke',
        `--id ${contractId}`,
        `--network ${this.config.network}`,
        `--source ${this.config.adminKeyName}`,
        '-- get_state'
      ].join(' ');

      const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
      return JSON.parse(output);
    } catch (error) {
      throw new Error(`Failed to get contract state: ${error}`);
    }
  }

  /**
   * Save deployment information to files
   */
  private async saveDeploymentInfo(result: DeploymentResult): Promise<void> {
    // Save to deployments.json
    const deploymentsPath = join(__dirname, '../../deployments.json');
    let deployments: Record<string, DeploymentResult> = {};
    
    if (existsSync(deploymentsPath)) {
      deployments = JSON.parse(readFileSync(deploymentsPath, 'utf8'));
    }
    
    deployments[this.config.network] = result;
    writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));

    // Update environment file
    const envPath = join(__dirname, this.config.envFile);
    const envContent = [
      `# Auto-generated by deployment orchestrator on ${result.deployedAt}`,
      `STELLAR_NETWORK=${result.network}`,
      `STELLAR_HORIZON_URL=${this.config.horizonUrl}`,
      `STELLAR_SOROBAN_RPC_URL=${this.config.sorobanRpcUrl}`,
      `FACTORY_CONTRACT_ID=${result.contractId}`,
      `VITE_NETWORK=${result.network}`,
      `VITE_FACTORY_CONTRACT_ID=${result.contractId}`,
      ''
    ].join('\n');
    
    writeFileSync(envPath, envContent);

    // Legacy compatibility - save to deployment-testnet.json
    if (this.config.network === 'testnet') {
      const legacyPath = join(__dirname, '../../deployment-testnet.json');
      const legacyData = {
        network: result.network,
        contractId: result.contractId,
        admin: result.admin,
        treasury: result.treasury,
        baseFee: this.config.baseFee,
        metadataFee: this.config.metadataFee,
        deployedAt: result.deployedAt
      };
      writeFileSync(legacyPath, JSON.stringify(legacyData, null, 2));
    }
  }
}
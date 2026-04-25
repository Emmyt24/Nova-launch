import * as StellarSdk from '@stellar/stellar-sdk';
import { STELLAR_CONFIG, getNetworkConfig } from '../config/stellar';
import type { TokenInfo, TransactionDetails, AppError } from '../types';
import { ErrorCode } from '../types';

export class StellarService {
  private network: 'testnet' | 'mainnet';
  private server: StellarSdk.SorobanRpc.Server;
  private horizonServer: StellarSdk.Horizon.Server;
  private networkPassphrase: string;
  private contractClient: StellarSdk.Contract | null = null;

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    this.network = network;
    const config = getNetworkConfig(network);
    
    this.server = new StellarSdk.SorobanRpc.Server(config.sorobanRpcUrl);
    this.horizonServer = new StellarSdk.Horizon.Server(config.horizonUrl);
    this.networkPassphrase = config.networkPassphrase;
    
    this.initializeContractClient();
  }

  private initializeContractClient(): void {
    const contractId = STELLAR_CONFIG.factoryContractId;
    if (!contractId) {
      console.warn('Factory contract ID not configured');
      return;
    }

    try {
      this.contractClient = new StellarSdk.Contract(contractId);
    } catch (error) {
      throw this.createError(
        ErrorCode.CONTRACT_ERROR,
        'Failed to initialize contract client',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  switchNetwork(network: 'testnet' | 'mainnet'): void {
    if (this.network === network) return;

    this.network = network;
    const config = getNetworkConfig(network);
    
    this.server = new StellarSdk.SorobanRpc.Server(config.sorobanRpcUrl);
    this.horizonServer = new StellarSdk.Horizon.Server(config.horizonUrl);
    this.networkPassphrase = config.networkPassphrase;
    
    this.initializeContractClient();
  }

  getNetwork(): 'testnet' | 'mainnet' {
    return this.network;
  }

  getContractClient(): StellarSdk.Contract {
    if (!this.contractClient) {
      throw this.createError(
        ErrorCode.CONTRACT_ERROR,
        'Contract client not initialized',
        'Factory contract ID not configured'
      );
    }
    return this.contractClient;
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    try {
      StellarSdk.Address.fromString(tokenAddress);
    } catch {
      throw this.createError(ErrorCode.INVALID_INPUT, 'Invalid token address');
    }

    try {
      const txHistory = await this.horizonServer
        .transactions()
        .forAccount(tokenAddress)
        .limit(1)
        .order('asc')
        .call();

      const firstTx = txHistory.records[0];

      return {
        address: tokenAddress,
        name: '',
        symbol: '',
        decimals: 7,
        totalSupply: '0',
        creator: firstTx?.source_account || '',
        metadataUri: undefined,
        deployedAt: firstTx ? new Date(firstTx.created_at).getTime() : Date.now(),
        transactionHash: firstTx?.hash || '',
      };
    } catch (error) {
      throw this.createError(
        ErrorCode.NETWORK_ERROR,
        'Failed to fetch token info',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  async getTransaction(hash: string): Promise<TransactionDetails> {
    try {
      const tx = await this.horizonServer.transactions().transaction(hash).call();
      
      return {
        hash,
        status: tx.successful ? 'success' : 'failed',
        timestamp: new Date(tx.created_at).getTime(),
        fee: tx.fee_charged || '0',
      };
    } catch (error) {
      if (error instanceof StellarSdk.NotFoundError) {
        return {
          hash,
          status: 'pending',
          timestamp: Date.now(),
          fee: '0',
        };
      }
      throw this.createError(
        ErrorCode.NETWORK_ERROR,
        'Failed to fetch transaction',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  private createError(code: string, message: string, details?: string): AppError {
    return { code, message, details };
  }

  /**
   * Burn tokens via factory contract
   * 
   * Issue: #615 - Integrate Burn UI with Real Factory Burn Calls
   * 
   * @param params - Burn parameters
   * @returns Transaction hash and burn details
   */
  async burnTokens(params: {
    tokenAddress: string;
    amount: string;
    from: string;
  }): Promise<{ txHash: string; isAdminBurn: boolean }> {
    // Validate inputs
    if (!params.tokenAddress || !params.from) {
      throw this.createError(ErrorCode.INVALID_INPUT, 'Invalid burn parameters');
    }
    
    if (!params.amount || parseInt(params.amount) <= 0) {
      throw this.createError(ErrorCode.INVALID_INPUT, 'Invalid burn amount');
    }

    // TODO: Implement actual burn transaction submission
    // This requires:
    // 1. Building the transaction with factory contract method
    // 2. Signing with user's wallet (via freighter or other wallet)
    // 3. Submitting to Soroban network
    // 4. Waiting for confirmation and returning tx hash
    
    throw this.createError(
      ErrorCode.NOT_IMPLEMENTED,
      'Burn transaction requires wallet integration'
    );
  }
}

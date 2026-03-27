import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  StellarConfig,
  DEFAULT_STELLAR_CONFIG,
  TokenInfo,
  BurnEvent,
  FactoryState,
  ParsedContractEvent,
  TransactionDetails,
  TransactionStatus,
  MonitorTransactionResult,
} from "./stellar.config";
import {
  StellarNetworkException,
  StellarContractException,
  StellarNotFoundException,
  StellarParseException,
  StellarTimeoutException,
  StellarTransactionFailedException,
} from "./stellar.exceptions";
import { RateLimiter } from "./rate-limiter";
import {
  assertValidAddress,
  isValidAddress,
  calculateBackoff,
  sleep,
} from "./stellar.utils";

@Injectable()
export class StellarService implements OnModuleInit {
  private readonly logger = new Logger(StellarService.name);
  private readonly config: StellarConfig;
  private horizon: StellarSdk.Horizon.Server;
  private soroban: StellarSdk.rpc.Server;
  private readonly rateLimiter: RateLimiter;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      network:
        this.configService.get<"testnet" | "mainnet">("STELLAR_NETWORK") ??
        DEFAULT_STELLAR_CONFIG.network,
      horizonUrl:
        this.configService.get<string>("STELLAR_HORIZON_URL") ??
        DEFAULT_STELLAR_CONFIG.horizonUrl,
      sorobanRpcUrl:
        this.configService.get<string>("STELLAR_SOROBAN_RPC_URL") ??
        DEFAULT_STELLAR_CONFIG.sorobanRpcUrl,
      factoryContractId:
        this.configService.get<string>("STELLAR_FACTORY_CONTRACT_ID") ??
        DEFAULT_STELLAR_CONFIG.factoryContractId,
      requestTimeout:
        this.configService.get<number>("STELLAR_REQUEST_TIMEOUT") ??
        DEFAULT_STELLAR_CONFIG.requestTimeout,
      retry: {
        maxAttempts:
          this.configService.get<number>("STELLAR_RETRY_MAX_ATTEMPTS") ??
          DEFAULT_STELLAR_CONFIG.retry.maxAttempts,
        initialDelay:
          this.configService.get<number>("STELLAR_RETRY_INITIAL_DELAY") ??
          DEFAULT_STELLAR_CONFIG.retry.initialDelay,
        maxDelay:
          this.configService.get<number>("STELLAR_RETRY_MAX_DELAY") ??
          DEFAULT_STELLAR_CONFIG.retry.maxDelay,
        backoffFactor:
          this.configService.get<number>("STELLAR_RETRY_BACKOFF_FACTOR") ??
          DEFAULT_STELLAR_CONFIG.retry.backoffFactor,
      },
      rateLimit: {
        maxRequests:
          this.configService.get<number>("STELLAR_RATE_LIMIT_MAX") ??
          DEFAULT_STELLAR_CONFIG.rateLimit.maxRequests,
        windowMs:
          this.configService.get<number>("STELLAR_RATE_LIMIT_WINDOW_MS") ??
          DEFAULT_STELLAR_CONFIG.rateLimit.windowMs,
      },
    };

    this.rateLimiter = new RateLimiter(
      this.config.rateLimit.maxRequests,
      this.config.rateLimit.windowMs
    );
  }

  onModuleInit(): void {
    this.horizon = new StellarSdk.Horizon.Server(this.config.horizonUrl, {
      allowHttp: this.config.network === "testnet",
    });

    this.soroban = new StellarSdk.rpc.Server(this.config.sorobanRpcUrl, {
      allowHttp: this.config.network === "testnet",
    });

    this.logger.log(
      `StellarService initialized on ${this.config.network}. ` +
        `Horizon: ${this.config.horizonUrl}, Soroban: ${this.config.sorobanRpcUrl}`
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Validates a Stellar address (account or contract).
   */
  validateAddress(address: string): boolean {
    this.logger.debug(`Validating address: ${address}`);
    return isValidAddress(address);
  }

  /**
   * Fetches token details from a Soroban token contract.
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    assertValidAddress(tokenAddress);
    this.logger.log(`Fetching token info for: ${tokenAddress}`);

    return this.withRetry(async () => {
      this.rateLimiter.checkLimit();
      try {
        const [name, symbol, decimals, totalSupply, admin] = await Promise.all([
          this.callContract<string>(tokenAddress, "name", []),
          this.callContract<string>(tokenAddress, "symbol", []),
          this.callContract<number>(tokenAddress, "decimals", []),
          this.callContract<string>(tokenAddress, "total_supply", []),
          this.callContract<string>(tokenAddress, "admin", []),
        ]);

        return {
          address: tokenAddress,
          name,
          symbol,
          decimals,
          totalSupply,
          admin,
        };
      } catch (error) {
        this.logger.error(
          `Failed to fetch token info for ${tokenAddress}`,
          error
        );
        throw new StellarContractException(
          `Failed to fetch token info for ${tokenAddress}`,
          error
        );
      }
    }, "getTokenInfo");
  }

  /**
   * Retrieves burn events for a given token address.
   */
  async getBurnHistory(tokenAddress: string): Promise<BurnEvent[]> {
    assertValidAddress(tokenAddress);
    this.logger.log(`Fetching burn history for: ${tokenAddress}`);

    return this.withRetry(async () => {
      this.rateLimiter.checkLimit();
      try {
        const response = await this.soroban.getEvents({
          startLedger: 1,
          filters: [
            {
              type: "contract",
              contractIds: [tokenAddress],
              topics: [["burn"]],
            },
          ],
        });

        return response.events.map((event) =>
          this.parseBurnEvent(event, tokenAddress)
        );
      } catch (error) {
        this.logger.error(
          `Failed to fetch burn history for ${tokenAddress}`,
          error
        );
        throw new StellarContractException(
          `Failed to fetch burn history for ${tokenAddress}`,
          error
        );
      }
    }, "getBurnHistory");
  }

  /**
   * Gets the factory contract state.
   */
  async getFactoryState(): Promise<FactoryState> {
    if (!this.config.factoryContractId) {
      throw new StellarContractException(
        "Factory contract ID is not configured"
      );
    }

    this.logger.log(`Fetching factory state: ${this.config.factoryContractId}`);

    return this.withRetry(async () => {
      this.rateLimiter.checkLimit();
      try {
        const [admin, totalTokens, tokens, isPaused] = await Promise.all([
          this.callContract<string>(
            this.config.factoryContractId,
            "get_admin",
            []
          ),
          this.callContract<number>(
            this.config.factoryContractId,
            "get_token_count",
            []
          ),
          this.callContract<string[]>(
            this.config.factoryContractId,
            "get_tokens",
            []
          ),
          this.callContract<boolean>(
            this.config.factoryContractId,
            "is_paused",
            []
          ),
        ]);

        return {
          contractId: this.config.factoryContractId,
          admin,
          totalTokens,
          tokens,
          isPaused,
        };
      } catch (error) {
        this.logger.error("Failed to fetch factory state", error);
        throw new StellarContractException(
          "Failed to fetch factory state",
          error
        );
      }
    }, "getFactoryState");
  }

  /**
   * Parses a raw Soroban contract event into a structured format.
   */
  parseContractEvent(
    event: StellarSdk.rpc.Api.EventResponse
  ): ParsedContractEvent {
    try {
      const topics = event.topic.map((t) => StellarSdk.scValToNative(t));
      const data = StellarSdk.scValToNative(event.value);

      return {
        type: topics[0] as string,
        contractId: event.contractId,
        topics: topics.slice(1),
        data,
        ledger: event.ledger,
        txHash: event.txHash,
        timestamp: new Date(event.ledgerClosedAt).toISOString(),
      };
    } catch (error) {
      this.logger.error("Failed to parse contract event", error);
      throw new StellarParseException("Failed to parse contract event", error);
    }
  }

  /**
   * Retrieves full transaction details from Horizon.
   */
  async getTransaction(txHash: string): Promise<TransactionDetails> {
    if (!txHash || typeof txHash !== "string") {
      throw new StellarNotFoundException("Transaction", txHash);
    }

    this.logger.log(`Fetching transaction: ${txHash}`);

    return this.withRetry(async () => {
      this.rateLimiter.checkLimit();
      try {
        const tx = await this.horizon.transactions().transaction(txHash).call();

        return {
          hash: tx.hash,
          ledger: tx.ledger_attr,
          createdAt: tx.created_at,
          sourceAccount: tx.source_account,
          fee: tx.fee_charged,
          status: tx.successful ? "success" : "failed",
          memo: tx.memo,
          operationCount: tx.operation_count,
          envelopeXdr: tx.envelope_xdr,
          resultXdr: tx.result_xdr,
          resultMetaXdr: tx.result_meta_xdr,
        };
      } catch (error: any) {
        if (error?.response?.status === 404) {
          throw new StellarNotFoundException("Transaction", txHash);
        }
        this.logger.error(`Failed to fetch transaction ${txHash}`, error);
        throw new StellarNetworkException(
          `Failed to fetch transaction ${txHash}`,
          error
        );
      }
    }, "getTransaction");
  }

  /**
   * Monitors a transaction until it reaches a terminal state.
   * Polls with exponential backoff.
   */
  async monitorTransaction(
    txHash: string,
    maxAttempts = 20,
    pollIntervalMs = 3000
  ): Promise<MonitorTransactionResult> {
    this.logger.log(`Monitoring transaction: ${txHash}`);
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      this.rateLimiter.checkLimit();

      try {
        const tx = await this.horizon.transactions().transaction(txHash).call();
        const status: TransactionStatus = tx.successful ? "success" : "failed";

        this.logger.log(
          `Transaction ${txHash} reached status: ${status} after ${attempts} attempt(s)`
        );

        if (status === "failed") {
          return {
            hash: txHash,
            status,
            ledger: tx.ledger_attr,
            createdAt: tx.created_at,
            errorMessage: tx.result_xdr,
            attempts,
          };
        }

        return {
          hash: txHash,
          status,
          ledger: tx.ledger_attr,
          createdAt: tx.created_at,
          attempts,
        };
      } catch (error: any) {
        if (error?.response?.status === 404) {
          this.logger.debug(
            `Transaction ${txHash} not found yet (attempt ${attempts}/${maxAttempts})`
          );
          if (attempts < maxAttempts) {
            await sleep(pollIntervalMs);
            continue;
          }
          return { hash: txHash, status: "not_found", attempts };
        }

        this.logger.warn(
          `Error polling transaction ${txHash}:`,
          error?.message
        );
        if (attempts < maxAttempts) {
          await sleep(pollIntervalMs);
        }
      }
    }

    this.logger.warn(
      `Transaction ${txHash} monitoring timed out after ${attempts} attempts`
    );
    return { hash: txHash, status: "pending", attempts };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Invokes a read-only Soroban contract method and returns the native result.
   */
  private async callContract<T>(
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[]
  ): Promise<T> {
    const account = await this.soroban
      .getAccount(StellarSdk.Keypair.random().publicKey())
      .catch(() => {
        // Use a dummy account for read-only simulations
        return {
          accountId: () => StellarSdk.Keypair.random().publicKey(),
          sequenceNumber: () => "0",
          incrementSequenceNumber: () => {},
        } as any;
      });

    const contract = new StellarSdk.Contract(contractId);
    const tx = new StellarSdk.TransactionBuilder(account as any, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase:
        this.config.network === "mainnet"
          ? StellarSdk.Networks.PUBLIC
          : StellarSdk.Networks.TESTNET,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(Math.floor(this.config.requestTimeout / 1000))
      .build();

    const simulation = await this.soroban.simulateTransaction(tx);

    if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new StellarContractException(
        `Contract call failed: ${method}`,
        simulation.error
      );
    }

    const result = (
      simulation as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse
    ).result;

    if (!result) {
      throw new StellarContractException(
        `No result from contract call: ${method}`
      );
    }

    return StellarSdk.scValToNative(result.retval) as T;
  }

  /**
   * Wraps an async operation with retry + exponential backoff logic.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.config.retry.maxAttempts; attempt++) {
      try {
        const result = await Promise.race<T>([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new StellarTimeoutException(operationName)),
              this.config.requestTimeout
            )
          ),
        ]);
        return result;
      } catch (error) {
        lastError = error;

        // Don't retry on validation or not-found errors
        if (
          error instanceof StellarTimeoutException ||
          (error as any)?.code === "INVALID_ADDRESS" ||
          (error as any)?.status === 404
        ) {
          throw error;
        }

        if (attempt < this.config.retry.maxAttempts - 1) {
          const delay = calculateBackoff(
            attempt,
            this.config.retry.initialDelay,
            this.config.retry.maxDelay,
            this.config.retry.backoffFactor
          );
          this.logger.warn(
            `${operationName} failed (attempt ${attempt + 1}/${this.config.retry.maxAttempts}). Retrying in ${delay}ms...`
          );
          await sleep(delay);
        }
      }
    }

    this.logger.error(
      `${operationName} failed after ${this.config.retry.maxAttempts} attempts`
    );
    throw lastError;
  }

  /**
   * Maps a raw Soroban event to a BurnEvent.
   */
  private parseBurnEvent(
    event: StellarSdk.rpc.Api.EventResponse,
    tokenAddress: string
  ): BurnEvent {
    try {
      const parsed = this.parseContractEvent(event);
      return {
        txHash: parsed.txHash,
        ledger: parsed.ledger,
        timestamp: parsed.timestamp,
        from: parsed.topics[0] as string,
        amount: String(parsed.data),
        tokenAddress,
      };
    } catch (error) {
      throw new StellarParseException("Failed to parse burn event", error);
    }
  }
}

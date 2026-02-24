/**
 * Integration tests for StellarService.
 *
 * These tests run against real Stellar testnet infrastructure.
 * They are skipped by default (STELLAR_INTEGRATION_TESTS env flag controls them).
 *
 * Run with:
 *   STELLAR_INTEGRATION_TESTS=true npx jest stellar.service.integration.spec.ts
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { StellarService } from "./stellar.service";

const RUN_INTEGRATION = process.env.STELLAR_INTEGRATION_TESTS === "true";
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

// Well-known testnet values (update as needed)
const TESTNET_TOKEN = process.env.STELLAR_TEST_TOKEN_ADDRESS ?? "";
const TESTNET_TX_HASH = process.env.STELLAR_TEST_TX_HASH ?? "";
const TESTNET_ACCOUNT = process.env.STELLAR_TEST_ACCOUNT ?? "";
const TESTNET_FACTORY = process.env.STELLAR_FACTORY_CONTRACT_ID ?? "";

describeIntegration("StellarService (integration)", () => {
  let service: StellarService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: ".env.test",
          isGlobal: true,
        }),
      ],
      providers: [StellarService],
    }).compile();

    service = module.get<StellarService>(StellarService);
    service.onModuleInit();
  });

  it("validates a known testnet address", () => {
    if (!TESTNET_ACCOUNT) return;
    expect(service.validateAddress(TESTNET_ACCOUNT)).toBe(true);
  });

  it("rejects an invalid address", () => {
    expect(service.validateAddress("not-a-real-address")).toBe(false);
  });

  it("fetches a real transaction", async () => {
    if (!TESTNET_TX_HASH) {
      console.warn("Skipping: STELLAR_TEST_TX_HASH not set");
      return;
    }
    const tx = await service.getTransaction(TESTNET_TX_HASH);
    expect(tx.hash).toBe(TESTNET_TX_HASH);
    expect(["success", "failed"]).toContain(tx.status);
  }, 30_000);

  it("monitors a real transaction to completion", async () => {
    if (!TESTNET_TX_HASH) {
      console.warn("Skipping: STELLAR_TEST_TX_HASH not set");
      return;
    }
    const result = await service.monitorTransaction(TESTNET_TX_HASH, 5, 2000);
    expect(["success", "failed", "not_found", "pending"]).toContain(
      result.status
    );
  }, 60_000);

  it("fetches token info from a real contract", async () => {
    if (!TESTNET_TOKEN) {
      console.warn("Skipping: STELLAR_TEST_TOKEN_ADDRESS not set");
      return;
    }
    const info = await service.getTokenInfo(TESTNET_TOKEN);
    expect(info.address).toBe(TESTNET_TOKEN);
    expect(info.symbol).toBeTruthy();
    expect(info.decimals).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("fetches burn history for a real contract", async () => {
    if (!TESTNET_TOKEN) {
      console.warn("Skipping: STELLAR_TEST_TOKEN_ADDRESS not set");
      return;
    }
    const burns = await service.getBurnHistory(TESTNET_TOKEN);
    expect(Array.isArray(burns)).toBe(true);
  }, 30_000);

  it("fetches factory state", async () => {
    if (!TESTNET_FACTORY) {
      console.warn("Skipping: STELLAR_FACTORY_CONTRACT_ID not set");
      return;
    }
    const state = await service.getFactoryState();
    expect(state.contractId).toBeTruthy();
    expect(typeof state.isPaused).toBe("boolean");
  }, 30_000);
});

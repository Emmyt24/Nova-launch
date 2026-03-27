import { StellarService, TestAccount } from '../../services/stellar.service';
import { IPFSService } from '../../services/IPFSService';

/**
 * Helper utilities for integration and e2e tests
 */

export interface TestContext {
  stellarService: StellarService;
  ipfsService: IPFSService;
  testAccount: TestAccount;
  deployedTokens: string[];
  uploadedHashes: string[];
}

/**
 * Initialize test context with services and test account
 */
export async function setupTestContext(): Promise<TestContext> {
  const stellarService = new StellarService('testnet');
  const ipfsService = new IPFSService();

  // Create and fund test account
  const testAccount = await stellarService.createTestAccount();
  await stellarService.fundTestAccount(testAccount.publicKey);

  // Wait for funding to complete
  await sleep(5000);

  return {
    stellarService,
    ipfsService,
    testAccount,
    deployedTokens: [],
    uploadedHashes: [],
  };
}

/**
 * Cleanup test resources
 */
export async function cleanupTestContext(context: TestContext): Promise<void> {
  // Cleanup IPFS content
  for (const hash of context.uploadedHashes) {
    try {
      await context.ipfsService.unpinContent(hash);
    } catch (error) {
      console.warn(`Failed to cleanup IPFS hash ${hash}:`, error);
    }
  }
}

/**
 * Create a test image file
 */
export function createTestImageFile(
  name: string = 'test-image.png',
  size: number = 1024
): File {
  const blob = new Blob([new ArrayBuffer(size)], { type: 'image/png' });
  return new File([blob], name, { type: 'image/png' });
}

/**
 * Create test metadata
 */
export function createTestMetadata(overrides?: Partial<any>) {
  return {
    name: 'Test Token',
    symbol: 'TEST',
    decimals: 7,
    description: 'A test token',
    ...overrides,
  };
}

/**
 * Sleep utility for waiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for transaction confirmation
 */
export async function waitForConfirmation(
  stellarService: StellarService,
  tokenAddress: string,
  maxAttempts: number = 10
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const exists = await stellarService.verifyTokenExists(tokenAddress);
      if (exists) {
        return true;
      }
    } catch (error) {
      // Token not yet available
    }
    await sleep(3000);
  }
  return false;
}

/**
 * Generate random token parameters
 */
export function generateRandomTokenParams() {
  const random = Math.random().toString(36).substring(7);
  return {
    name: `Test Token ${random}`,
    symbol: `TST${random.substring(0, 3).toUpperCase()}`,
    decimals: 7,
    initialSupply: String(Math.floor(Math.random() * 10000000) + 1000000),
  };
}

/**
 * Assert token deployment success
 */
export async function assertTokenDeployment(
  stellarService: StellarService,
  tokenAddress: string,
  expectedCreator: string,
  expectedSupply: string
): Promise<void> {
  // Verify token exists
  const exists = await stellarService.verifyTokenExists(tokenAddress);
  if (!exists) {
    throw new Error(`Token ${tokenAddress} does not exist`);
  }

  // Verify creator balance
  const balance = await stellarService.getTokenBalance(tokenAddress, expectedCreator);
  if (balance !== expectedSupply) {
    throw new Error(
      `Expected balance ${expectedSupply}, got ${balance}`
    );
  }
}

/**
 * Create multiple test accounts
 */
export async function createMultipleTestAccounts(
  stellarService: StellarService,
  count: number
): Promise<TestAccount[]> {
  const accounts: TestAccount[] = [];

  for (let i = 0; i < count; i++) {
    const account = await stellarService.createTestAccount();
    await stellarService.fundTestAccount(account.publicKey);
    accounts.push(account);
    await sleep(2000); // Rate limit friendbot requests
  }

  return accounts;
}

/**
 * Verify IPFS content accessibility
 */
export async function verifyIPFSContent(
  ipfsService: IPFSService,
  ipfsHash: string,
  expectedContent: any
): Promise<boolean> {
  try {
    const content = await ipfsService.retrieveContent(ipfsHash);
    return JSON.stringify(content) === JSON.stringify(expectedContent);
  } catch (error) {
    return false;
  }
}

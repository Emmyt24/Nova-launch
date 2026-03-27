import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StellarService, TestAccount } from '../../services/stellar.service';
import { IPFSService } from '../../services/IPFSService';

describe('Stellar Testnet Integration Tests', () => {
  let stellarService: StellarService;
  let ipfsService: IPFSService;
  let testAccount: TestAccount;
  const deployedTokens: string[] = [];
  const uploadedHashes: string[] = [];

  beforeAll(async () => {
    stellarService = new StellarService('testnet');
    ipfsService = new IPFSService();

    // Create and fund test account
    testAccount = await stellarService.createTestAccount();
    await stellarService.fundTestAccount(testAccount.publicKey);

    // Wait for account to be funded
    await new Promise(resolve => setTimeout(resolve, 5000));
  });

  afterAll(async () => {
    // Cleanup IPFS content
    for (const hash of uploadedHashes) {
      try {
        await ipfsService.unpinContent(hash);
      } catch (error) {
        console.warn(`Failed to cleanup IPFS hash ${hash}:`, error);
      }
    }
  });

  describe('Token Deployment Without Metadata', () => {
    it('should deploy token successfully', async () => {
      const params = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 7,
        initialSupply: '1000000',
      };

      const result = await stellarService.deployToken(testAccount, params);

      expect(result).toBeDefined();
      expect(result.tokenAddress).toBeTruthy();
      expect(result.transactionHash).toBeTruthy();
      expect(result.creatorBalance).toBe(params.initialSupply);

      deployedTokens.push(result.tokenAddress);
    });

    it('should verify token exists on-chain', async () => {
      const params = {
        name: 'Verifiable Token',
        symbol: 'VRF',
        decimals: 7,
        initialSupply: '500000',
      };

      const result = await stellarService.deployToken(testAccount, params);
      deployedTokens.push(result.tokenAddress);

      const exists = await stellarService.verifyTokenExists(result.tokenAddress);
      expect(exists).toBe(true);
    });

    it('should verify creator balance', async () => {
      const params = {
        name: 'Balance Test Token',
        symbol: 'BAL',
        decimals: 7,
        initialSupply: '2000000',
      };

      const result = await stellarService.deployToken(testAccount, params);
      deployedTokens.push(result.tokenAddress);

      const balance = await stellarService.getTokenBalance(
        result.tokenAddress,
        testAccount.publicKey
      );

      expect(balance).toBe(params.initialSupply);
    });
  });

  describe('Token Deployment With Metadata', () => {
    it('should deploy token with IPFS metadata', async () => {
      // Upload metadata to IPFS
      const metadata = {
        name: 'Metadata Token',
        symbol: 'META',
        decimals: 7,
        description: 'Token with IPFS metadata',
      };

      const ipfsResult = await ipfsService.uploadMetadata(metadata);
      uploadedHashes.push(ipfsResult.ipfsHash);

      // Deploy token with metadata URI
      const params = {
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        initialSupply: '1500000',
        metadataUri: ipfsResult.ipfsUri,
      };

      const result = await stellarService.deployToken(testAccount, params);
      deployedTokens.push(result.tokenAddress);

      expect(result).toBeDefined();
      expect(result.tokenAddress).toBeTruthy();
    });

    it('should verify metadata URI on-chain', async () => {
      const metadata = {
        name: 'URI Verification Token',
        symbol: 'URIVRF',
        decimals: 7,
        description: 'Testing metadata URI storage',
      };

      const ipfsResult = await ipfsService.uploadMetadata(metadata);
      uploadedHashes.push(ipfsResult.ipfsHash);

      const params = {
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        initialSupply: '1000000',
        metadataUri: ipfsResult.ipfsUri,
      };

      const result = await stellarService.deployToken(testAccount, params);
      deployedTokens.push(result.tokenAddress);

      const storedMetadataUri = await stellarService.getTokenMetadata(result.tokenAddress);
      expect(storedMetadataUri).toBe(ipfsResult.ipfsUri);
    });

    it('should deploy token with image metadata', async () => {
      // Upload image
      const imageBlob = new Blob(['test logo'], { type: 'image/png' });
      const imageFile = new File([imageBlob], 'token-logo.png', { type: 'image/png' });
      const imageResult = await ipfsService.uploadImage(imageFile);
      uploadedHashes.push(imageResult.ipfsHash);

      // Upload metadata with image reference
      const metadata = {
        name: 'Image Token',
        symbol: 'IMG',
        decimals: 7,
        description: 'Token with image',
        image: imageResult.ipfsUri,
      };

      const metadataResult = await ipfsService.uploadMetadata(metadata);
      uploadedHashes.push(metadataResult.ipfsHash);

      // Deploy token
      const params = {
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        initialSupply: '3000000',
        metadataUri: metadataResult.ipfsUri,
      };

      const result = await stellarService.deployToken(testAccount, params);
      deployedTokens.push(result.tokenAddress);

      expect(result).toBeDefined();
      expect(result.tokenAddress).toBeTruthy();
    });
  });

  describe('Fee Verification', () => {
    it('should collect base fee for deployment without metadata', async () => {
      const params = {
        name: 'Fee Test Token',
        symbol: 'FEE',
        decimals: 7,
        initialSupply: '1000000',
      };

      const result = await stellarService.deployToken(testAccount, params);
      deployedTokens.push(result.tokenAddress);

      // TODO: Verify treasury received base fee
      expect(result.tokenAddress).toBeTruthy();
    });

    it('should collect base + metadata fee for deployment with metadata', async () => {
      const metadata = {
        name: 'Full Fee Token',
        symbol: 'FFEE',
        decimals: 7,
      };

      const ipfsResult = await ipfsService.uploadMetadata(metadata);
      uploadedHashes.push(ipfsResult.ipfsHash);

      const params = {
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        initialSupply: '1000000',
        metadataUri: ipfsResult.ipfsUri,
      };

      const result = await stellarService.deployToken(testAccount, params);
      deployedTokens.push(result.tokenAddress);

      // TODO: Verify treasury received base + metadata fee
      expect(result.tokenAddress).toBeTruthy();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle insufficient balance', async () => {
      // Create unfunded account
      const unfundedAccount = await stellarService.createTestAccount();

      const params = {
        name: 'Fail Token',
        symbol: 'FAIL',
        decimals: 7,
        initialSupply: '1000000',
      };

      await expect(
        stellarService.deployToken(unfundedAccount, params)
      ).rejects.toThrow();
    });

    it('should handle invalid parameters', async () => {
      const invalidParams = {
        name: '',
        symbol: 'INVALID',
        decimals: 7,
        initialSupply: '1000000',
      };

      await expect(
        stellarService.deployToken(testAccount, invalidParams)
      ).rejects.toThrow();
    });

    it('should handle invalid metadata URI', async () => {
      const params = {
        name: 'Invalid Metadata Token',
        symbol: 'INVMETA',
        decimals: 7,
        initialSupply: '1000000',
        metadataUri: 'invalid://not-a-real-uri',
      };

      await expect(
        stellarService.deployToken(testAccount, params)
      ).rejects.toThrow();
    });
  });

  describe('Multiple Deployments', () => {
    it('should deploy multiple tokens from same account', async () => {
      const tokens = [
        { name: 'Token One', symbol: 'ONE', decimals: 7, initialSupply: '1000000' },
        { name: 'Token Two', symbol: 'TWO', decimals: 7, initialSupply: '2000000' },
        { name: 'Token Three', symbol: 'THREE', decimals: 7, initialSupply: '3000000' },
      ];

      for (const params of tokens) {
        const result = await stellarService.deployToken(testAccount, params);
        deployedTokens.push(result.tokenAddress);

        expect(result.tokenAddress).toBeTruthy();
        expect(result.creatorBalance).toBe(params.initialSupply);
      }

      expect(deployedTokens.length).toBeGreaterThanOrEqual(3);
    });
  });
});

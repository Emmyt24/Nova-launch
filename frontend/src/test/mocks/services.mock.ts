import { vi } from 'vitest';
import type { TestAccount, TokenDeploymentParams, TokenDeploymentResult } from '../../services/stellar.service';
import type { IPFSUploadResult } from '../../services/IPFSService';
import type { TokenMetadata } from '../../types';

/**
 * Mock implementations for testing without real API calls
 */

export class MockStellarService {
  private network: 'testnet' | 'mainnet';
  private mockTokens: Map<string, any> = new Map();

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    this.network = network;
  }

  async createTestAccount(): Promise<TestAccount> {
    return {
      publicKey: `G${Math.random().toString(36).substring(2, 58).toUpperCase()}`,
      secretKey: `S${Math.random().toString(36).substring(2, 58).toUpperCase()}`,
    };
  }

  async fundTestAccount(publicKey: string): Promise<void> {
    // Mock funding - no actual operation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async deployToken(
    account: TestAccount,
    params: TokenDeploymentParams
  ): Promise<TokenDeploymentResult> {
    if (!params.name || params.name.length === 0) {
      throw new Error('Invalid parameters: name is required');
    }

    const tokenAddress = `C${Math.random().toString(36).substring(2, 58).toUpperCase()}`;
    const transactionHash = `${Math.random().toString(36).substring(2, 66)}`;

    this.mockTokens.set(tokenAddress, {
      ...params,
      creator: account.publicKey,
      address: tokenAddress,
    });

    return {
      tokenAddress,
      transactionHash,
      creatorBalance: params.initialSupply,
    };
  }

  async getTokenBalance(tokenAddress: string, accountAddress: string): Promise<string> {
    const token = this.mockTokens.get(tokenAddress);
    if (!token) {
      throw new Error('Token not found');
    }
    return token.creator === accountAddress ? token.initialSupply : '0';
  }

  async verifyTokenExists(tokenAddress: string): Promise<boolean> {
    return this.mockTokens.has(tokenAddress);
  }

  async getTokenMetadata(tokenAddress: string): Promise<string | null> {
    const token = this.mockTokens.get(tokenAddress);
    return token?.metadataUri || null;
  }
}

export class MockIPFSService {
  private mockUploads: Map<string, any> = new Map();

  async uploadImage(file: File): Promise<IPFSUploadResult> {
    const validation = this.validateImageFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const ipfsHash = `Qm${Math.random().toString(36).substring(2, 46)}`;
    this.mockUploads.set(ipfsHash, { type: 'image', file });

    return {
      ipfsHash,
      ipfsUri: `ipfs://${ipfsHash}`,
      pinataUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
    };
  }

  async uploadMetadata(metadata: TokenMetadata): Promise<IPFSUploadResult> {
    if (!metadata) {
      throw new Error('Metadata is required');
    }

    const ipfsHash = `Qm${Math.random().toString(36).substring(2, 46)}`;
    this.mockUploads.set(ipfsHash, { type: 'metadata', content: metadata });

    return {
      ipfsHash,
      ipfsUri: `ipfs://${ipfsHash}`,
      pinataUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
    };
  }

  async retrieveContent(ipfsHash: string): Promise<any> {
    const upload = this.mockUploads.get(ipfsHash);
    if (!upload) {
      throw new Error('Content not found');
    }
    return upload.type === 'metadata' ? upload.content : upload.file;
  }

  async unpinContent(ipfsHash: string): Promise<void> {
    this.mockUploads.delete(ipfsHash);
  }

  validateImageFile(file: File): { valid: boolean; error?: string } {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (file.size > maxSize) {
      return { valid: false, error: 'File size exceeds 5MB limit' };
    }

    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed' };
    }

    return { valid: true };
  }
}

/**
 * Create mock services for testing
 */
export function createMockServices() {
  return {
    stellarService: new MockStellarService('testnet'),
    ipfsService: new MockIPFSService(),
  };
}

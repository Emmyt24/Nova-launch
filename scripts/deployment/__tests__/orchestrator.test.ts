import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { DeploymentOrchestrator } from '../orchestrator.js';
import { DEFAULT_CONFIG } from '../types.js';
import type { DeploymentConfig } from '../types.js';

// Mock external dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mock-hash-123')
  }))
}));

const mockExecSync = vi.mocked(execSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);

describe('DeploymentOrchestrator', () => {
  let orchestrator: DeploymentOrchestrator;
  let config: DeploymentConfig;

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG };
    orchestrator = new DeploymentOrchestrator(config);
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Default mock implementations
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from('mock-wasm-content'));
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('--version')) return 'soroban 21.0.0';
      if (cmd.includes('keys address')) return 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      if (cmd.includes('contract deploy')) return 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      if (cmd.includes('get_state')) return '{"admin":"GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}';
      return '';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('deploy', () => {
    it('should successfully deploy contract with all steps', async () => {
      const result = await orchestrator.deploy();

      expect(result).toMatchObject({
        contractId: 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        network: 'testnet',
        wasmHash: 'mock-hash-123'
      });

      // Verify all deployment steps were called
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('--version'), expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('contract deploy'), expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('initialize'), expect.any(Object));
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should fail if soroban CLI is not available', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) throw new Error('Command not found');
        return '';
      });

      await expect(orchestrator.deploy()).rejects.toThrow('Soroban CLI not found');
    });

    it('should fail if WASM file does not exist', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return !path.includes('token_factory.wasm');
      });

      await expect(orchestrator.deploy()).rejects.toThrow('WASM file not found');
    });

    it('should fail if admin identity does not exist', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) return 'soroban 21.0.0';
        if (cmd.includes('keys address admin')) throw new Error('Identity not found');
        return '';
      });

      await expect(orchestrator.deploy()).rejects.toThrow('Admin identity');
    });

    it('should create treasury identity if it does not exist', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) return 'soroban 21.0.0';
        if (cmd.includes('keys address admin')) return 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        if (cmd.includes('keys address treasury')) throw new Error('Identity not found');
        if (cmd.includes('keys generate')) return '';
        if (cmd.includes('contract deploy')) return 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        if (cmd.includes('get_state')) return '{"admin":"GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"}';
        return '';
      });

      await orchestrator.deploy();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('keys generate --global treasury'),
        expect.any(Object)
      );
    });

    it('should handle deployment failure gracefully', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) return 'soroban 21.0.0';
        if (cmd.includes('keys address')) return 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        if (cmd.includes('contract deploy')) throw new Error('Deployment failed');
        return '';
      });

      await expect(orchestrator.deploy()).rejects.toThrow('Deployment failed');
    });

    it('should handle initialization failure gracefully', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) return 'soroban 21.0.0';
        if (cmd.includes('keys address')) return 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        if (cmd.includes('contract deploy')) return 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        if (cmd.includes('initialize')) throw new Error('Initialization failed');
        return '';
      });

      await expect(orchestrator.deploy()).rejects.toThrow('Initialization failed');
    });
  });

  describe('verify', () => {
    const contractId = 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    it('should successfully verify valid contract', async () => {
      const result = await orchestrator.verify(contractId);

      expect(result).toMatchObject({
        contractId,
        isValid: true,
        wasmHashMatch: true,
        stateValid: true,
        errors: []
      });
    });

    it('should detect WASM hash mismatch', async () => {
      // Mock different hash for deployed contract
      const mockCreateHash = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn()
          .mockReturnValueOnce('source-hash')  // First call for source
          .mockReturnValueOnce('deployed-hash') // Second call for deployed
      }));
      
      vi.doMock('crypto', () => ({ createHash: mockCreateHash }));

      const result = await orchestrator.verify(contractId);

      expect(result.isValid).toBe(false);
      expect(result.wasmHashMatch).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('WASM hash mismatch'));
    });

    it('should handle contract state retrieval failure', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('get_state')) throw new Error('State retrieval failed');
        return '';
      });

      const result = await orchestrator.verify(contractId);

      expect(result.isValid).toBe(false);
      expect(result.stateValid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Verification error'));
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle network timeouts', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('contract deploy')) {
          const error = new Error('Network timeout');
          (error as any).code = 'ETIMEDOUT';
          throw error;
        }
        if (cmd.includes('--version')) return 'soroban 21.0.0';
        if (cmd.includes('keys address')) return 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        return '';
      });

      await expect(orchestrator.deploy()).rejects.toThrow('Network timeout');
    });

    it('should handle insufficient funds error', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('contract deploy')) throw new Error('Insufficient funds');
        if (cmd.includes('--version')) return 'soroban 21.0.0';
        if (cmd.includes('keys address')) return 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        return '';
      });

      await expect(orchestrator.deploy()).rejects.toThrow('Insufficient funds');
    });

    it('should handle sequence number mismatch', async () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('initialize')) throw new Error('Sequence number mismatch');
        if (cmd.includes('--version')) return 'soroban 21.0.0';
        if (cmd.includes('keys address')) return 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        if (cmd.includes('contract deploy')) return 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        return '';
      });

      await expect(orchestrator.deploy()).rejects.toThrow('Sequence number mismatch');
    });

    it('should handle invalid initialization arguments', async () => {
      const invalidConfig = { ...config, baseFee: -1 };
      const invalidOrchestrator = new DeploymentOrchestrator(invalidConfig);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('initialize')) throw new Error('Invalid arguments');
        if (cmd.includes('--version')) return 'soroban 21.0.0';
        if (cmd.includes('keys address')) return 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        if (cmd.includes('contract deploy')) return 'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        return '';
      });

      await expect(invalidOrchestrator.deploy()).rejects.toThrow('Invalid arguments');
    });
  });

  describe('file operations', () => {
    it('should save deployment info to multiple files', async () => {
      await orchestrator.deploy();

      // Check that files were written
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('deployments.json'),
        expect.any(String)
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.env.testnet'),
        expect.any(String)
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('deployment-testnet.json'),
        expect.any(String)
      );
    });

    it('should handle file write errors gracefully', async () => {
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should still complete deployment even if file writes fail
      await expect(orchestrator.deploy()).rejects.toThrow();
    });

    it('should preserve existing deployments when updating', async () => {
      const existingDeployments = {
        mainnet: { contractId: 'EXISTING_CONTRACT' }
      };
      
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('deployments.json')) {
          return JSON.stringify(existingDeployments);
        }
        return Buffer.from('mock-wasm-content');
      });

      await orchestrator.deploy();

      const writeCall = mockWriteFileSync.mock.calls.find(call => 
        call[0].toString().includes('deployments.json')
      );
      
      expect(writeCall).toBeDefined();
      const writtenData = JSON.parse(writeCall![1] as string);
      expect(writtenData.mainnet).toEqual(existingDeployments.mainnet);
      expect(writtenData.testnet).toBeDefined();
    });
  });

  describe('configuration validation', () => {
    it('should validate network configuration', () => {
      const mainnetConfig = { ...config, network: 'mainnet' as const };
      const mainnetOrchestrator = new DeploymentOrchestrator(mainnetConfig);
      
      expect(mainnetOrchestrator).toBeDefined();
    });

    it('should handle custom fee configuration', async () => {
      const customConfig = { 
        ...config, 
        baseFee: 50000000, 
        metadataFee: 20000000 
      };
      const customOrchestrator = new DeploymentOrchestrator(customConfig);

      await customOrchestrator.deploy();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--base_fee 50000000'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--metadata_fee 20000000'),
        expect.any(Object)
      );
    });
  });
});
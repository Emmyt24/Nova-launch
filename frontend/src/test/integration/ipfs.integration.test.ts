import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { IPFSService } from '../../services/IPFSService';

describe('IPFS Integration Tests', () => {
  let ipfsService: IPFSService;
  const uploadedHashes: string[] = [];

  beforeAll(() => {
    // Use test credentials or mock service
    const testApiKey = process.env.VITE_IPFS_API_KEY || 'test-key';
    const testApiSecret = process.env.VITE_IPFS_API_SECRET || 'test-secret';
    ipfsService = new IPFSService(testApiKey, testApiSecret);
  });

  afterAll(async () => {
    // Cleanup: Unpin all uploaded content
    for (const hash of uploadedHashes) {
      try {
        await ipfsService.unpinContent(hash);
      } catch (error) {
        console.warn(`Failed to unpin ${hash}:`, error);
      }
    }
  });

  describe('Image Upload', () => {
    it('should upload a valid image successfully', async () => {
      // Create a test image file
      const imageBlob = new Blob(['test image data'], { type: 'image/png' });
      const imageFile = new File([imageBlob], 'test-token-logo.png', { type: 'image/png' });

      const result = await ipfsService.uploadImage(imageFile);

      expect(result).toBeDefined();
      expect(result.ipfsHash).toBeTruthy();
      expect(result.ipfsUri).toMatch(/^ipfs:\/\//);
      expect(result.pinataUrl).toContain('gateway.pinata.cloud');

      uploadedHashes.push(result.ipfsHash);
    });

    it('should reject image file that is too large', async () => {
      // Create a file larger than 5MB
      const largeBlob = new Blob([new ArrayBuffer(6 * 1024 * 1024)], { type: 'image/png' });
      const largeFile = new File([largeBlob], 'large-image.png', { type: 'image/png' });

      const validation = ipfsService.validateImageFile(largeFile);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('exceeds 5MB limit');
    });

    it('should reject invalid file type', async () => {
      const invalidBlob = new Blob(['test data'], { type: 'application/pdf' });
      const invalidFile = new File([invalidBlob], 'document.pdf', { type: 'application/pdf' });

      const validation = ipfsService.validateImageFile(invalidFile);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Invalid file type');
    });

    it('should accept valid image types', async () => {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

      for (const type of validTypes) {
        const blob = new Blob(['test'], { type });
        const file = new File([blob], `test.${type.split('/')[1]}`, { type });

        const validation = ipfsService.validateImageFile(file);

        expect(validation.valid).toBe(true);
        expect(validation.error).toBeUndefined();
      }
    });
  });

  describe('Metadata Upload', () => {
    it('should upload metadata JSON successfully', async () => {
      const metadata = {
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 7,
        description: 'A test token for integration testing',
      };

      const result = await ipfsService.uploadMetadata(metadata);

      expect(result).toBeDefined();
      expect(result.ipfsHash).toBeTruthy();
      expect(result.ipfsUri).toMatch(/^ipfs:\/\//);

      uploadedHashes.push(result.ipfsHash);
    });

    it('should upload metadata with image reference', async () => {
      // First upload an image
      const imageBlob = new Blob(['test image'], { type: 'image/png' });
      const imageFile = new File([imageBlob], 'logo.png', { type: 'image/png' });
      const imageResult = await ipfsService.uploadImage(imageFile);

      uploadedHashes.push(imageResult.ipfsHash);

      // Then upload metadata referencing the image
      const metadata = {
        name: 'Token With Image',
        symbol: 'TWI',
        decimals: 7,
        description: 'Token with image metadata',
        image: imageResult.ipfsUri,
      };

      const metadataResult = await ipfsService.uploadMetadata(metadata);

      expect(metadataResult).toBeDefined();
      expect(metadataResult.ipfsHash).toBeTruthy();

      uploadedHashes.push(metadataResult.ipfsHash);
    });
  });

  describe('Content Retrieval', () => {
    it('should retrieve uploaded metadata', async () => {
      const metadata = {
        name: 'Retrievable Token',
        symbol: 'RTV',
        decimals: 7,
      };

      const uploadResult = await ipfsService.uploadMetadata(metadata);
      uploadedHashes.push(uploadResult.ipfsHash);

      const retrievedContent = await ipfsService.retrieveContent(uploadResult.ipfsHash);

      expect(retrievedContent).toEqual(metadata);
    });

    it('should handle retrieval of non-existent content', async () => {
      const fakeHash = 'QmInvalidHashThatDoesNotExist123456789';

      await expect(ipfsService.retrieveContent(fakeHash)).rejects.toThrow();
    });
  });

  describe('IPFS URI Verification', () => {
    it('should generate correct IPFS URI format', async () => {
      const metadata = { name: 'URI Test', symbol: 'URI', decimals: 7 };
      const result = await ipfsService.uploadMetadata(metadata);

      uploadedHashes.push(result.ipfsHash);

      expect(result.ipfsUri).toMatch(/^ipfs:\/\/Qm[a-zA-Z0-9]{44}$/);
      expect(result.ipfsUri).toBe(`ipfs://${result.ipfsHash}`);
    });

    it('should generate accessible Pinata gateway URL', async () => {
      const metadata = { name: 'Gateway Test', symbol: 'GTW', decimals: 7 };
      const result = await ipfsService.uploadMetadata(metadata);

      uploadedHashes.push(result.ipfsHash);

      expect(result.pinataUrl).toBe(
        `https://gateway.pinata.cloud/ipfs/${result.ipfsHash}`
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const invalidService = new IPFSService('invalid-key', 'invalid-secret');
      const metadata = { name: 'Error Test', symbol: 'ERR', decimals: 7 };

      await expect(invalidService.uploadMetadata(metadata)).rejects.toThrow();
    });

    it('should handle malformed metadata', async () => {
      const malformedMetadata = null as any;

      await expect(ipfsService.uploadMetadata(malformedMetadata)).rejects.toThrow();
    });
  });
});

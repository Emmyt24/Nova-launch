import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateFileType,
  validateFileSize,
  validateDimensions,
  validateImage,
  formatImageFileSize,
  createImagePreview,
  revokeImagePreview,
  DEFAULT_IMAGE_CONFIG,
  type ImageValidationConfig,
} from '../imageValidation';

describe('imageValidation', () => {
  describe('validateFileType', () => {
    it('should accept valid PNG file', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const result = validateFileType(file, DEFAULT_IMAGE_CONFIG.allowedTypes);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid JPEG file', () => {
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const result = validateFileType(file, DEFAULT_IMAGE_CONFIG.allowedTypes);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid SVG file', () => {
      const file = new File([''], 'test.svg', { type: 'image/svg+xml' });
      const result = validateFileType(file, DEFAULT_IMAGE_CONFIG.allowedTypes);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid file type', () => {
      const file = new File([''], 'test.gif', { type: 'image/gif' });
      const result = validateFileType(file, DEFAULT_IMAGE_CONFIG.allowedTypes);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
      expect(result.error).toContain('PNG, JPEG, JPG, SVG+XML');
    });

    it('should reject file with no type', () => {
      const file = new File([''], 'test.txt', { type: '' });
      const result = validateFileType(file, DEFAULT_IMAGE_CONFIG.allowedTypes);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unable to determine file type');
    });

    it('should work with custom allowed types', () => {
      const file = new File([''], 'test.webp', { type: 'image/webp' });
      const result = validateFileType(file, ['image/webp']);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('validateFileSize', () => {
    it('should accept file within size limit', () => {
      const file = new File(['x'.repeat(1024 * 1024)], 'test.png', { type: 'image/png' }); // 1MB
      const result = validateFileSize(file, 5 * 1024 * 1024);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept file at exact size limit', () => {
      const maxSize = 5 * 1024 * 1024;
      const file = new File(['x'.repeat(maxSize)], 'test.png', { type: 'image/png' });
      const result = validateFileSize(file, maxSize);
      
      expect(result.valid).toBe(true);
    });

    it('should reject file exceeding size limit', () => {
      const file = new File(['x'.repeat(6 * 1024 * 1024)], 'test.png', { type: 'image/png' }); // 6MB
      const result = validateFileSize(file, 5 * 1024 * 1024);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
      expect(result.error).toContain('5.0MB');
    });

    it('should handle zero-size files', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const result = validateFileSize(file, 5 * 1024 * 1024);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('validateDimensions', () => {
    const config: ImageValidationConfig = {
      ...DEFAULT_IMAGE_CONFIG,
      minWidth: 64,
      minHeight: 64,
      maxWidth: 2048,
      maxHeight: 2048,
      recommendedWidth: 512,
      recommendedHeight: 512,
    };

    it('should accept dimensions within limits', () => {
      const result = validateDimensions(512, 512, config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn about non-recommended dimensions', () => {
      const result = validateDimensions(256, 256, config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Recommended dimensions are 512x512px');
    });

    it('should reject dimensions below minimum', () => {
      const result = validateDimensions(32, 32, config);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('below minimum');
    });

    it('should reject dimensions above maximum', () => {
      const result = validateDimensions(3000, 3000, config);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('exceeds maximum');
    });

    it('should reject width below minimum', () => {
      const result = validateDimensions(32, 512, config);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Image width (32px) is below minimum of 64px');
    });

    it('should reject height below minimum', () => {
      const result = validateDimensions(512, 32, config);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Image height (32px) is below minimum of 64px');
    });

    it('should reject width above maximum', () => {
      const result = validateDimensions(3000, 512, config);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Image width (3000px) exceeds maximum of 2048px');
    });

    it('should reject height above maximum', () => {
      const result = validateDimensions(512, 3000, config);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Image height (3000px) exceeds maximum of 2048px');
    });

    it('should handle config without min/max limits', () => {
      const minimalConfig: ImageValidationConfig = {
        allowedTypes: ['image/png'],
        maxSizeBytes: 5 * 1024 * 1024,
        recommendedWidth: 512,
        recommendedHeight: 512,
      };
      
      const result = validateDimensions(5000, 5000, minimalConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('formatImageFileSize', () => {
    it('should format bytes', () => {
      expect(formatImageFileSize(0)).toBe('0 Bytes');
      expect(formatImageFileSize(500)).toBe('500 Bytes');
      expect(formatImageFileSize(1023)).toBe('1023 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatImageFileSize(1024)).toBe('1 KB');
      expect(formatImageFileSize(1536)).toBe('1.5 KB');
      expect(formatImageFileSize(10240)).toBe('10 KB');
    });

    it('should format megabytes', () => {
      expect(formatImageFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatImageFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
      expect(formatImageFileSize(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatImageFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatImageFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
    });
  });

  describe('createImagePreview and revokeImagePreview', () => {
    let mockCreateObjectURL: ReturnType<typeof vi.fn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
      mockRevokeObjectURL = vi.fn();
      
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create preview URL', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const url = createImagePreview(file);
      
      expect(mockCreateObjectURL).toHaveBeenCalledWith(file);
      expect(url).toBe('blob:mock-url');
    });

    it('should revoke preview URL', () => {
      const url = 'blob:mock-url';
      revokeImagePreview(url);
      
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(url);
    });
  });

  describe('validateImage - integration', () => {
    beforeEach(() => {
      // Mock Image constructor
      global.Image = class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 512;
        height = 512;
        src = '';

        constructor() {
          setTimeout(() => {
            if (this.onload) {
              this.onload();
            }
          }, 0);
        }
      } as unknown as typeof Image;

      // Mock URL methods
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should validate valid PNG image', async () => {
      const file = new File(['x'.repeat(1024)], 'test.png', { type: 'image/png' });
      const result = await validateImage(file);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.width).toBe(512);
      expect(result.metadata?.height).toBe(512);
    });

    it('should reject invalid file type', async () => {
      const file = new File([''], 'test.gif', { type: 'image/gif' });
      const result = await validateImage(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid file type');
    });

    it('should reject oversized file', async () => {
      const file = new File(['x'.repeat(6 * 1024 * 1024)], 'test.png', { type: 'image/png' });
      const result = await validateImage(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum allowed size'))).toBe(true);
    });
  });

  describe('DEFAULT_IMAGE_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_IMAGE_CONFIG.allowedTypes).toEqual([
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/svg+xml',
      ]);
      expect(DEFAULT_IMAGE_CONFIG.maxSizeBytes).toBe(5 * 1024 * 1024);
      expect(DEFAULT_IMAGE_CONFIG.recommendedWidth).toBe(512);
      expect(DEFAULT_IMAGE_CONFIG.recommendedHeight).toBe(512);
      expect(DEFAULT_IMAGE_CONFIG.maxWidth).toBe(2048);
      expect(DEFAULT_IMAGE_CONFIG.maxHeight).toBe(2048);
      expect(DEFAULT_IMAGE_CONFIG.minWidth).toBe(64);
      expect(DEFAULT_IMAGE_CONFIG.minHeight).toBe(64);
    });
  });
});

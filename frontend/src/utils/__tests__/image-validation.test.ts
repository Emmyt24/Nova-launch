import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    validateImageType,
    validateImageSize,
    validateImageDimensions,
    validateImage,
    createImagePreview,
    revokeImagePreview,
    formatFileSize,
    IMAGE_VALIDATION_CONFIG,
} from '../validation';

describe('Image Validation', () => {
    describe('validateImageType', () => {
        it('should accept PNG files', () => {
            const file = new File([''], 'test.png', { type: 'image/png' });
            const result = validateImageType(file);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should accept JPEG files', () => {
            const file = new File([''], 'test.jpeg', { type: 'image/jpeg' });
            const result = validateImageType(file);
            expect(result.valid).toBe(true);
        });

        it('should accept JPG files', () => {
            const file = new File([''], 'test.jpg', { type: 'image/jpg' });
            const result = validateImageType(file);
            expect(result.valid).toBe(true);
        });

        it('should accept SVG files', () => {
            const file = new File([''], 'test.svg', { type: 'image/svg+xml' });
            const result = validateImageType(file);
            expect(result.valid).toBe(true);
        });

        it('should reject GIF files', () => {
            const file = new File([''], 'test.gif', { type: 'image/gif' });
            const result = validateImageType(file);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid file type');
        });

        it('should reject PDF files', () => {
            const file = new File([''], 'test.pdf', { type: 'application/pdf' });
            const result = validateImageType(file);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid file type');
        });

        it('should reject files with no type', () => {
            const file = new File([''], 'test', { type: '' });
            const result = validateImageType(file);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('unknown');
        });
    });

    describe('validateImageSize', () => {
        it('should accept files under 5MB', () => {
            const size = 3 * 1024 * 1024; // 3MB
            const file = new File([new ArrayBuffer(size)], 'test.png', { type: 'image/png' });
            const result = validateImageSize(file);
            expect(result.valid).toBe(true);
        });

        it('should accept files exactly at 5MB', () => {
            const size = 5 * 1024 * 1024; // 5MB
            const file = new File([new ArrayBuffer(size)], 'test.png', { type: 'image/png' });
            const result = validateImageSize(file);
            expect(result.valid).toBe(true);
        });

        it('should reject files over 5MB', () => {
            const size = 6 * 1024 * 1024; // 6MB
            const file = new File([new ArrayBuffer(size)], 'test.png', { type: 'image/png' });
            const result = validateImageSize(file);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('exceeds maximum');
            expect(result.error).toContain('6.00MB');
        });

        it('should reject empty files', () => {
            const file = new File([], 'test.png', { type: 'image/png' });
            const result = validateImageSize(file);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('empty');
        });

        it('should accept small files', () => {
            const size = 100 * 1024; // 100KB
            const file = new File([new ArrayBuffer(size)], 'test.png', { type: 'image/png' });
            const result = validateImageSize(file);
            expect(result.valid).toBe(true);
        });
    });

    describe('validateImageDimensions', () => {
        beforeEach(() => {
            // Mock Image constructor
            global.Image = class MockImage {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                src = '';
                width = 0;
                height = 0;

                constructor() {
                    setTimeout(() => {
                        if (this.onload) {
                            this.onload();
                        }
                    }, 0);
                }
            } as unknown as typeof Image;

            // Mock URL.createObjectURL and revokeObjectURL
            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = vi.fn();
        });

        it('should accept SVG files without dimension check', async () => {
            const file = new File(['<svg></svg>'], 'test.svg', { type: 'image/svg+xml' });
            const result = await validateImageDimensions(file);
            expect(result.valid).toBe(true);
            expect(result.warnings).toEqual([]);
        });

        it('should accept images with recommended dimensions', async () => {
            const file = new File([''], 'test.png', { type: 'image/png' });
            
            global.Image = class MockImage {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                src = '';
                width = 512;
                height = 512;

                constructor() {
                    setTimeout(() => {
                        if (this.onload) {
                            this.onload();
                        }
                    }, 0);
                }
            } as unknown as typeof Image;

            const result = await validateImageDimensions(file);
            expect(result.valid).toBe(true);
            expect(result.warnings).toEqual([]);
            expect(result.dimensions).toEqual({ width: 512, height: 512 });
        });

        it('should warn about non-recommended dimensions', async () => {
            const file = new File([''], 'test.png', { type: 'image/png' });
            
            global.Image = class MockImage {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                src = '';
                width = 1024;
                height = 1024;

                constructor() {
                    setTimeout(() => {
                        if (this.onload) {
                            this.onload();
                        }
                    }, 0);
                }
            } as unknown as typeof Image;

            const result = await validateImageDimensions(file);
            expect(result.valid).toBe(true);
            expect(result.warnings).toHaveLength(1);
            expect(result.warnings?.[0]).toContain('Recommended dimensions');
            expect(result.dimensions).toEqual({ width: 1024, height: 1024 });
        });

        it('should reject images exceeding maximum dimensions', async () => {
            const file = new File([''], 'test.png', { type: 'image/png' });
            
            global.Image = class MockImage {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                src = '';
                width = 5000;
                height = 5000;

                constructor() {
                    setTimeout(() => {
                        if (this.onload) {
                            this.onload();
                        }
                    }, 0);
                }
            } as unknown as typeof Image;

            const result = await validateImageDimensions(file);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('exceed maximum');
        });

        it('should handle corrupted images', async () => {
            const file = new File(['corrupted'], 'test.png', { type: 'image/png' });
            
            global.Image = class MockImage {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                src = '';

                constructor() {
                    setTimeout(() => {
                        if (this.onerror) {
                            this.onerror();
                        }
                    }, 0);
                }
            } as unknown as typeof Image;

            const result = await validateImageDimensions(file);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('corrupted or invalid');
        });
    });

    describe('validateImage', () => {
        beforeEach(() => {
            global.Image = class MockImage {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                src = '';
                width = 512;
                height = 512;

                constructor() {
                    setTimeout(() => {
                        if (this.onload) {
                            this.onload();
                        }
                    }, 0);
                }
            } as unknown as typeof Image;

            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = vi.fn();
        });

        it('should validate a correct image', async () => {
            const size = 1 * 1024 * 1024; // 1MB
            const file = new File([new ArrayBuffer(size)], 'test.png', { type: 'image/png' });
            const result = await validateImage(file);
            
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.size).toBe(size);
            expect(result.type).toBe('image/png');
        });

        it('should fail on invalid type', async () => {
            const file = new File([''], 'test.gif', { type: 'image/gif' });
            const result = await validateImage(file);
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid file type');
        });

        it('should fail on oversized file', async () => {
            const size = 10 * 1024 * 1024; // 10MB
            const file = new File([new ArrayBuffer(size)], 'test.png', { type: 'image/png' });
            const result = await validateImage(file);
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('exceeds maximum');
        });

        it('should include warnings for non-recommended dimensions', async () => {
            global.Image = class MockImage {
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;
                src = '';
                width = 256;
                height = 256;

                constructor() {
                    setTimeout(() => {
                        if (this.onload) {
                            this.onload();
                        }
                    }, 0);
                }
            } as unknown as typeof Image;

            const size = 1 * 1024 * 1024;
            const file = new File([new ArrayBuffer(size)], 'test.png', { type: 'image/png' });
            const result = await validateImage(file);
            
            expect(result.valid).toBe(true);
            expect(result.warnings).toHaveLength(1);
        });
    });

    describe('createImagePreview and revokeImagePreview', () => {
        beforeEach(() => {
            global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
            global.URL.revokeObjectURL = vi.fn();
        });

        it('should create preview URL', () => {
            const file = new File([''], 'test.png', { type: 'image/png' });
            const url = createImagePreview(file);
            
            expect(url).toBe('blob:mock-url');
            expect(global.URL.createObjectURL).toHaveBeenCalledWith(file);
        });

        it('should revoke preview URL', () => {
            const url = 'blob:mock-url';
            revokeImagePreview(url);
            
            expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(url);
        });
    });

    describe('formatFileSize', () => {
        it('should format bytes', () => {
            expect(formatFileSize(0)).toBe('0 Bytes');
            expect(formatFileSize(500)).toBe('500 Bytes');
            expect(formatFileSize(1023)).toBe('1023 Bytes');
        });

        it('should format kilobytes', () => {
            expect(formatFileSize(1024)).toBe('1 KB');
            expect(formatFileSize(1536)).toBe('1.5 KB');
            expect(formatFileSize(10240)).toBe('10 KB');
        });

        it('should format megabytes', () => {
            expect(formatFileSize(1048576)).toBe('1 MB');
            expect(formatFileSize(5242880)).toBe('5 MB');
            expect(formatFileSize(3145728)).toBe('3 MB');
        });

        it('should format gigabytes', () => {
            expect(formatFileSize(1073741824)).toBe('1 GB');
            expect(formatFileSize(2147483648)).toBe('2 GB');
        });
    });

    describe('IMAGE_VALIDATION_CONFIG', () => {
        it('should have correct configuration', () => {
            expect(IMAGE_VALIDATION_CONFIG.allowedTypes).toEqual([
                'image/png',
                'image/jpeg',
                'image/jpg',
                'image/svg+xml',
            ]);
            expect(IMAGE_VALIDATION_CONFIG.maxSize).toBe(5 * 1024 * 1024);
            expect(IMAGE_VALIDATION_CONFIG.recommendedDimensions).toEqual({ width: 512, height: 512 });
            expect(IMAGE_VALIDATION_CONFIG.maxDimensions).toEqual({ width: 4096, height: 4096 });
        });
    });
});

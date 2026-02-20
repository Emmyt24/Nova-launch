/**
 * Validation utilities for token deployment
 */

export const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * Validate Stellar address format
 */
export function isValidStellarAddress(address: string): boolean {
    return STELLAR_ADDRESS_REGEX.test(address);
}

/**
 * Validate token name (1-32 characters, alphanumeric + spaces + hyphens)
 */
export function isValidTokenName(name: string): boolean {
    if (!name || name.length < 1 || name.length > 32) {
        return false;
    }
    return /^[a-zA-Z0-9\s-]+$/.test(name);
}

/**
 * Validate token symbol (1-12 characters, uppercase alphanumeric)
 */
export function isValidTokenSymbol(symbol: string): boolean {
    if (!symbol || symbol.length < 1 || symbol.length > 12) {
        return false;
    }
    return /^[A-Z0-9]+$/.test(symbol);
}

/**
 * Validate decimals (0-18)
 */
export function isValidDecimals(decimals: number): boolean {
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 18;
}

/**
 * Validate initial supply (positive number)
 */
export function isValidSupply(supply: string): boolean {
    try {
        const num = BigInt(supply);
        return num > 0n && num <= BigInt(2 ** 53 - 1);
    } catch {
        return false;
    }
}

/**
 * Image validation configuration
 */
export const IMAGE_VALIDATION_CONFIG = {
    allowedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'] as const,
    maxSize: 5 * 1024 * 1024, // 5MB
    recommendedDimensions: { width: 512, height: 512 },
    maxDimensions: { width: 4096, height: 4096 },
} as const;

export interface ImageValidationResult {
    valid: boolean;
    error?: string;
    warnings?: string[];
    dimensions?: { width: number; height: number };
    size: number;
    type: string;
}

/**
 * Validate image file type
 */
export function validateImageType(file: File): { valid: boolean; error?: string } {
    const allowedTypes: readonly string[] = IMAGE_VALIDATION_CONFIG.allowedTypes;
    if (!allowedTypes.includes(file.type)) {
        return {
            valid: false,
            error: `Invalid file type. Allowed types: PNG, JPG, JPEG, SVG. Got: ${file.type || 'unknown'}`,
        };
    }
    return { valid: true };
}

/**
 * Validate image file size
 */
export function validateImageSize(file: File): { valid: boolean; error?: string } {
    if (file.size > IMAGE_VALIDATION_CONFIG.maxSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxMB = (IMAGE_VALIDATION_CONFIG.maxSize / (1024 * 1024)).toFixed(0);
        return {
            valid: false,
            error: `File size (${sizeMB}MB) exceeds maximum allowed size of ${maxMB}MB`,
        };
    }
    if (file.size === 0) {
        return { valid: false, error: 'File is empty' };
    }
    return { valid: true };
}

/**
 * Validate image dimensions
 */
export async function validateImageDimensions(
    file: File
): Promise<{ valid: boolean; error?: string; warnings?: string[]; dimensions?: { width: number; height: number } }> {
    return new Promise((resolve) => {
        // SVG files don't need dimension validation
        if (file.type === 'image/svg+xml') {
            resolve({ valid: true, warnings: [] });
            return;
        }

        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            const { width, height } = img;
            const warnings: string[] = [];

            // Check if dimensions exceed maximum
            if (width > IMAGE_VALIDATION_CONFIG.maxDimensions.width || height > IMAGE_VALIDATION_CONFIG.maxDimensions.height) {
                resolve({
                    valid: false,
                    error: `Image dimensions (${width}x${height}) exceed maximum allowed (${IMAGE_VALIDATION_CONFIG.maxDimensions.width}x${IMAGE_VALIDATION_CONFIG.maxDimensions.height})`,
                    dimensions: { width, height },
                });
                return;
            }

            // Check if dimensions match recommended size
            const { width: recWidth, height: recHeight } = IMAGE_VALIDATION_CONFIG.recommendedDimensions;
            if (width !== recWidth || height !== recHeight) {
                warnings.push(`Recommended dimensions are ${recWidth}x${recHeight}px. Your image is ${width}x${height}px.`);
            }

            resolve({
                valid: true,
                warnings,
                dimensions: { width, height },
            });
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve({
                valid: false,
                error: 'Failed to load image. The file may be corrupted or invalid.',
            });
        };

        img.src = url;
    });
}

/**
 * Comprehensive image validation
 */
export async function validateImage(file: File): Promise<ImageValidationResult> {
    // Validate type
    const typeValidation = validateImageType(file);
    if (!typeValidation.valid) {
        return {
            valid: false,
            error: typeValidation.error,
            size: file.size,
            type: file.type,
        };
    }

    // Validate size
    const sizeValidation = validateImageSize(file);
    if (!sizeValidation.valid) {
        return {
            valid: false,
            error: sizeValidation.error,
            size: file.size,
            type: file.type,
        };
    }

    // Validate dimensions
    const dimensionValidation = await validateImageDimensions(file);
    if (!dimensionValidation.valid) {
        return {
            valid: false,
            error: dimensionValidation.error,
            size: file.size,
            type: file.type,
            dimensions: dimensionValidation.dimensions,
        };
    }

    return {
        valid: true,
        warnings: dimensionValidation.warnings,
        size: file.size,
        type: file.type,
        dimensions: dimensionValidation.dimensions,
    };
}

/**
 * Create image preview URL
 */
export function createImagePreview(file: File): string {
    return URL.createObjectURL(file);
}

/**
 * Revoke image preview URL to free memory
 */
export function revokeImagePreview(url: string): void {
    URL.revokeObjectURL(url);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Validate image file (legacy function for backward compatibility)
 */
export function isValidImageFile(file: File): { valid: boolean; error?: string } {
    const typeValidation = validateImageType(file);
    if (!typeValidation.valid) return typeValidation;

    const sizeValidation = validateImageSize(file);
    if (!sizeValidation.valid) return sizeValidation;

    return { valid: true };
}

/**
 * Validate description length
 */
export function isValidDescription(description: string): boolean {
    return description.length <= 500;
}

/**
 * Validate all token deployment parameters
 */
export function validateTokenParams(params: {
    name: string;
    symbol: string;
    decimals: number;
    initialSupply: string;
    adminWallet: string;
}): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (!isValidTokenName(params.name)) {
        errors.name = 'Token name must be 1-32 alphanumeric characters';
    }

    if (!isValidTokenSymbol(params.symbol)) {
        errors.symbol = 'Token symbol must be 1-12 uppercase letters';
    }

    if (!isValidDecimals(params.decimals)) {
        errors.decimals = 'Decimals must be between 0 and 18';
    }

    if (!isValidSupply(params.initialSupply)) {
        errors.initialSupply = 'Initial supply must be a positive number';
    }

    if (!isValidStellarAddress(params.adminWallet)) {
        errors.adminWallet = 'Invalid Stellar address format';
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
    };
}

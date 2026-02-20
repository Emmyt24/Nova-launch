/**
 * Image validation utilities for IPFS uploads
 * Validates file type, size, and dimensions before upload
 */

export interface ImageValidationConfig {
  allowedTypes: string[];
  maxSizeBytes: number;
  recommendedWidth: number;
  recommendedHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface ImageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    width: number;
    height: number;
    size: number;
    type: string;
  };
}

export const DEFAULT_IMAGE_CONFIG: ImageValidationConfig = {
  allowedTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'],
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  recommendedWidth: 512,
  recommendedHeight: 512,
  maxWidth: 2048,
  maxHeight: 2048,
  minWidth: 64,
  minHeight: 64,
};

/**
 * Validates image file type
 */
export function validateFileType(file: File, allowedTypes: string[]): { valid: boolean; error?: string } {
  if (!file.type) {
    return { valid: false, error: 'Unable to determine file type' };
  }

  const isAllowed = allowedTypes.includes(file.type);
  if (!isAllowed) {
    const allowedExtensions = allowedTypes
      .map(type => type.split('/')[1].toUpperCase())
      .join(', ');
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allowedExtensions}`,
    };
  }

  return { valid: true };
}

/**
 * Validates image file size
 */
export function validateFileSize(file: File, maxSizeBytes: number): { valid: boolean; error?: string } {
  if (file.size > maxSizeBytes) {
    const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${fileSizeMB}MB) exceeds maximum allowed size of ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Loads image and returns dimensions
 */
export function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    // SVG files need special handling
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const parser = new DOMParser();
        const svg = parser.parseFromString(e.target?.result as string, 'image/svg+xml');
        const svgElement = svg.documentElement;
        
        const width = parseInt(svgElement.getAttribute('width') || '512');
        const height = parseInt(svgElement.getAttribute('height') || '512');
        
        resolve({ width, height });
      };
      reader.onerror = () => reject(new Error('Failed to read SVG file'));
      reader.readAsText(file);
      return;
    }

    // For raster images
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Validates image dimensions
 */
export function validateDimensions(
  width: number,
  height: number,
  config: ImageValidationConfig
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check minimum dimensions
  if (config.minWidth && width < config.minWidth) {
    errors.push(`Image width (${width}px) is below minimum of ${config.minWidth}px`);
  }
  if (config.minHeight && height < config.minHeight) {
    errors.push(`Image height (${height}px) is below minimum of ${config.minHeight}px`);
  }

  // Check maximum dimensions
  if (config.maxWidth && width > config.maxWidth) {
    errors.push(`Image width (${width}px) exceeds maximum of ${config.maxWidth}px`);
  }
  if (config.maxHeight && height > config.maxHeight) {
    errors.push(`Image height (${height}px) exceeds maximum of ${config.maxHeight}px`);
  }

  // Check recommended dimensions
  if (width !== config.recommendedWidth || height !== config.recommendedHeight) {
    warnings.push(
      `Recommended dimensions are ${config.recommendedWidth}x${config.recommendedHeight}px. ` +
      `Your image is ${width}x${height}px.`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Comprehensive image validation
 */
export async function validateImage(
  file: File,
  config: ImageValidationConfig = DEFAULT_IMAGE_CONFIG
): Promise<ImageValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate file type
  const typeValidation = validateFileType(file, config.allowedTypes);
  if (!typeValidation.valid && typeValidation.error) {
    errors.push(typeValidation.error);
    return { valid: false, errors, warnings };
  }

  // Validate file size
  const sizeValidation = validateFileSize(file, config.maxSizeBytes);
  if (!sizeValidation.valid && sizeValidation.error) {
    errors.push(sizeValidation.error);
  }

  // Load and validate dimensions
  try {
    const { width, height } = await loadImageDimensions(file);
    const dimensionValidation = validateDimensions(width, height, config);
    
    errors.push(...dimensionValidation.errors);
    warnings.push(...dimensionValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        width,
        height,
        size: file.size,
        type: file.type,
      },
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Failed to validate image dimensions');
    return { valid: false, errors, warnings };
  }
}

/**
 * Format file size for display in image validation context
 */
export function formatImageFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
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

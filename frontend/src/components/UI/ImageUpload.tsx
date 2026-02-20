import { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { Spinner } from './Spinner';
import {
  validateImage,
  createImagePreview,
  revokeImagePreview,
  formatImageFileSize,
  DEFAULT_IMAGE_CONFIG,
  type ImageValidationConfig,
  type ImageValidationResult,
} from '../../utils/imageValidation';

interface ImageUploadProps {
  onImageSelect: (file: File, validationResult: ImageValidationResult) => void;
  onImageRemove?: () => void;
  config?: Partial<ImageValidationConfig>;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}

export function ImageUpload({
  onImageSelect,
  onImageRemove,
  config,
  label = 'Token Logo',
  helperText = 'Upload PNG, JPG, or SVG (max 5MB, recommended 512x512px)',
  required = false,
  disabled = false,
}: ImageUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ImageValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validationConfig = { ...DEFAULT_IMAGE_CONFIG, ...config };

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        revokeImagePreview(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileValidation = async (file: File) => {
    setIsValidating(true);
    
    try {
      const result = await validateImage(file, validationConfig);
      setValidationResult(result);

      if (result.valid) {
        const preview = createImagePreview(file);
        setPreviewUrl(preview);
        setSelectedFile(file);
        onImageSelect(file, result);
      }
    } catch (error) {
      setValidationResult({
        valid: false,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        warnings: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileValidation(file);
    }
  };

  const handleRemove = () => {
    if (previewUrl) {
      revokeImagePreview(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onImageRemove?.();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileValidation(file);
    }
  };

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div
        className={`
          relative border-2 border-dashed rounded-lg p-6 transition-colors
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}
          ${validationResult && !validationResult.valid ? 'border-red-300 bg-red-50' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={validationConfig.allowedTypes.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
          aria-label={label}
        />

        {isValidating ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Spinner size="lg" />
            <p className="mt-4 text-sm text-gray-600">Validating image...</p>
          </div>
        ) : previewUrl && selectedFile ? (
          <div className="space-y-4">
            {/* Image Preview */}
            <div className="flex justify-center">
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-64 rounded-lg shadow-md"
                />
              </div>
            </div>

            {/* File Info */}
            <div className="bg-gray-50 rounded p-3 space-y-1">
              <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>Size: {formatImageFileSize(selectedFile.size)}</span>
                {validationResult?.metadata && (
                  <>
                    <span>
                      Dimensions: {validationResult.metadata.width}x{validationResult.metadata.height}px
                    </span>
                    <span>Type: {validationResult.metadata.type.split('/')[1].toUpperCase()}</span>
                  </>
                )}
              </div>
            </div>

            {/* Warnings */}
            {validationResult?.warnings && validationResult.warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm font-medium text-yellow-800 mb-1">Warnings:</p>
                <ul className="text-xs text-yellow-700 space-y-1">
                  {validationResult.warnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Remove Button */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              className="w-full"
            >
              Remove Image
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium text-blue-600 hover:text-blue-500">
                  Click to upload
                </span>{' '}
                or drag and drop
              </p>
              <p className="text-xs text-gray-500 mt-1">{helperText}</p>
            </div>
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {validationResult && !validationResult.valid && validationResult.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-sm font-medium text-red-800 mb-1">Validation Errors:</p>
          <ul className="text-xs text-red-700 space-y-1">
            {validationResult.errors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

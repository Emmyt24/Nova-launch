import { useState, useRef, useEffect } from 'react';
import { validateImage, createImagePreview, revokeImagePreview, formatFileSize, IMAGE_VALIDATION_CONFIG } from '../../utils/validation';
import type { ImageValidationResult } from '../../utils/validation';
import { Button } from './Button';
import { Spinner } from './Spinner';

interface ImageUploadProps {
    onImageSelect: (file: File) => void;
    onImageRemove: () => void;
    disabled?: boolean;
    currentImage?: File | null;
}

export function ImageUpload({ onImageSelect, onImageRemove, disabled = false, currentImage }: ImageUploadProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [validationResult, setValidationResult] = useState<ImageValidationResult | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Cleanup preview URL on unmount
        return () => {
            if (previewUrl) {
                revokeImagePreview(previewUrl);
            }
        };
    }, [previewUrl]);

    const handleFileValidation = async (file: File) => {
        setIsValidating(true);
        
        try {
            const result = await validateImage(file);
            setValidationResult(result);

            if (result.valid) {
                // Create preview
                const url = createImagePreview(file);
                setPreviewUrl(url);
                onImageSelect(file);
            }
        } catch {
            setValidationResult({
                valid: false,
                error: 'Failed to validate image',
                size: file.size,
                type: file.type,
            });
        } finally {
            setIsValidating(false);
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            handleFileValidation(file);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const file = e.dataTransfer.files?.[0];
        if (file) {
            void handleFileValidation(file);
        }
    };

    const handleRemove = () => {
        if (previewUrl) {
            revokeImagePreview(previewUrl);
        }
        setPreviewUrl(null);
        setValidationResult(null);
        onImageRemove();
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="space-y-4">
            {/* Upload Area */}
            {!previewUrl && (
                <div
                    className={`
                        relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
                        ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
                        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={disabled ? undefined : handleClick}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={IMAGE_VALIDATION_CONFIG.allowedTypes.join(',')}
                        onChange={handleFileChange}
                        disabled={disabled}
                        className="hidden"
                        aria-label="Upload image"
                    />

                    {isValidating ? (
                        <div className="flex flex-col items-center gap-2">
                            <Spinner size="lg" />
                            <p className="text-sm text-gray-600">Validating image...</p>
                        </div>
                    ) : (
                        <>
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
                                    <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    PNG, JPG, JPEG or SVG (max {formatFileSize(IMAGE_VALIDATION_CONFIG.maxSize)})
                                </p>
                                <p className="text-xs text-gray-500">
                                    Recommended: {IMAGE_VALIDATION_CONFIG.recommendedDimensions.width}x
                                    {IMAGE_VALIDATION_CONFIG.recommendedDimensions.height}px
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Preview */}
            {previewUrl && validationResult?.valid && (
                <div className="space-y-3">
                    <div className="relative rounded-lg border border-gray-300 p-4 bg-gray-50">
                        <div className="flex items-start gap-4">
                            <img
                                src={previewUrl}
                                alt="Preview"
                                className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                            />
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-gray-900 truncate">
                                    {currentImage?.name || 'Image preview'}
                                </h4>
                                <div className="mt-2 space-y-1 text-xs text-gray-600">
                                    <p>Size: {formatFileSize(validationResult.size)}</p>
                                    {validationResult.dimensions && (
                                        <p>
                                            Dimensions: {validationResult.dimensions.width}x{validationResult.dimensions.height}px
                                        </p>
                                    )}
                                    <p>Type: {validationResult.type}</p>
                                </div>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleRemove}
                                disabled={disabled}
                                aria-label="Remove image"
                            >
                                Remove
                            </Button>
                        </div>
                    </div>

                    {/* Warnings */}
                    {validationResult.warnings && validationResult.warnings.length > 0 && (
                        <div className="rounded-md bg-yellow-50 p-3 border border-yellow-200">
                            <div className="flex">
                                <svg
                                    className="h-5 w-5 text-yellow-400 flex-shrink-0"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    aria-hidden="true"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-yellow-800">Recommendations</h3>
                                    <div className="mt-1 text-sm text-yellow-700">
                                        <ul className="list-disc list-inside space-y-1">
                                            {validationResult.warnings.map((warning, index) => (
                                                <li key={index}>{warning}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Error Message */}
            {validationResult && !validationResult.valid && (
                <div className="rounded-md bg-red-50 p-4 border border-red-200">
                    <div className="flex">
                        <svg
                            className="h-5 w-5 text-red-400 flex-shrink-0"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">Validation Error</h3>
                            <p className="mt-1 text-sm text-red-700">{validationResult.error}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* eslint-disable react-refresh/only-export-components */
/**
 * ImageUpload Component Usage Examples
 * 
 * This file demonstrates how to use the ImageUpload component
 * with comprehensive image validation for IPFS uploads.
 */

import { useState } from 'react';
import { ImageUpload } from './ImageUpload';

/**
 * Basic Usage Example
 */
export function BasicImageUploadExample() {
    const [selectedImage, setSelectedImage] = useState<File | null>(null);

    const handleImageSelect = (file: File) => {
        setSelectedImage(file);
        console.log('Image selected:', file.name);
    };

    const handleImageRemove = () => {
        setSelectedImage(null);
        console.log('Image removed');
    };

    return (
        <div className="max-w-2xl mx-auto p-6">
            <h2 className="text-2xl font-bold mb-4">Upload Token Logo</h2>
            <ImageUpload
                onImageSelect={handleImageSelect}
                onImageRemove={handleImageRemove}
                currentImage={selectedImage}
            />
        </div>
    );
}

/**
 * Form Integration Example
 */
export function FormIntegrationExample() {
    const [formData, setFormData] = useState({
        tokenName: '',
        tokenSymbol: '',
        logo: null as File | null,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleImageSelect = (file: File) => {
        setFormData(prev => ({ ...prev, logo: file }));
    };

    const handleImageRemove = () => {
        setFormData(prev => ({ ...prev, logo: null }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // Upload to IPFS or process the image
            console.log('Submitting form with image:', formData.logo);
            // Your upload logic here
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 space-y-6">
            <div>
                <label className="block text-sm font-medium mb-2">Token Name</label>
                <input
                    type="text"
                    value={formData.tokenName}
                    onChange={(e) => setFormData(prev => ({ ...prev, tokenName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">Token Symbol</label>
                <input
                    type="text"
                    value={formData.tokenSymbol}
                    onChange={(e) => setFormData(prev => ({ ...prev, tokenSymbol: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">Token Logo</label>
                <ImageUpload
                    onImageSelect={handleImageSelect}
                    onImageRemove={handleImageRemove}
                    currentImage={formData.logo}
                    disabled={isSubmitting}
                />
            </div>

            <button
                type="submit"
                disabled={!formData.logo || isSubmitting}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg disabled:opacity-50"
            >
                {isSubmitting ? 'Uploading...' : 'Deploy Token'}
            </button>
        </form>
    );
}

/**
 * Programmatic Validation Example
 * 
 * This demonstrates how to use validation functions programmatically
 * outside of the ImageUpload component.
 */
export async function validateImageProgrammatically() {
    const { validateImage } = await import('../../utils/validation');

    // Example: Validate before upload
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (file) {
        const result = await validateImage(file);

        if (result.valid) {
            console.log('✓ Image is valid');
            console.log('Size:', result.size);
            console.log('Type:', result.type);
            console.log('Dimensions:', result.dimensions);
            
            if (result.warnings && result.warnings.length > 0) {
                console.warn('Warnings:', result.warnings);
            }
        } else {
            console.error('✗ Validation failed:', result.error);
        }
    }
}

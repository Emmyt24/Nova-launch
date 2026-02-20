/**
 * Complete Token Deployment Form Example
 * Demonstrates integration of ImageUpload with IPFS and token deployment
 */

import { useState } from 'react';
import { ImageUpload, Button, Input, Card } from '../UI';
import { uploadImageWithProgress } from '../../services/ipfs';
import { useToast } from '../../hooks/useToast';
import type { DeploymentStatus } from '../../types';

interface TokenFormData {
    name: string;
    symbol: string;
    decimals: number;
    initialSupply: string;
    description: string;
    logo: File | null;
}

export function TokenDeployFormExample() {
    const [formData, setFormData] = useState<TokenFormData>({
        name: '',
        symbol: '',
        decimals: 18,
        initialSupply: '',
        description: '',
        logo: null,
    });

    const [status, setStatus] = useState<DeploymentStatus>('idle');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [ipfsUrl, setIpfsUrl] = useState<string | null>(null);
    const { showToast } = useToast();

    const handleImageSelect = (file: File) => {
        setFormData(prev => ({ ...prev, logo: file }));
        showToast('Image validated successfully', 'success');
    };

    const handleImageRemove = () => {
        setFormData(prev => ({ ...prev, logo: null }));
        setIpfsUrl(null);
        setUploadProgress(0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.logo) {
            showToast('Please upload a token logo', 'error');
            return;
        }

        try {
            // Step 1: Upload image to IPFS
            setStatus('uploading');
            showToast('Uploading image to IPFS...', 'info');

            const uploadResult = await uploadImageWithProgress(
                formData.logo,
                (progress) => setUploadProgress(progress)
            );

            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'IPFS upload failed');
            }

            setIpfsUrl(uploadResult.ipfsUrl!);
            showToast('Image uploaded to IPFS successfully', 'success');

            // Step 2: Deploy token with metadata
            setStatus('deploying');
            showToast('Deploying token...', 'info');

            // Simulate token deployment
            await deployToken({
                name: formData.name,
                symbol: formData.symbol,
                decimals: formData.decimals,
                initialSupply: formData.initialSupply,
                metadata: {
                    name: formData.name,
                    description: formData.description,
                    image: uploadResult.ipfsUrl!,
                },
            });

            setStatus('success');
            showToast('Token deployed successfully!', 'success');

            // Reset form
            setTimeout(() => {
                setFormData({
                    name: '',
                    symbol: '',
                    decimals: 18,
                    initialSupply: '',
                    description: '',
                    logo: null,
                });
                setStatus('idle');
                setUploadProgress(0);
                setIpfsUrl(null);
            }, 3000);

        } catch (error) {
            setStatus('error');
            const errorMessage = error instanceof Error ? error.message : 'Deployment failed';
            showToast(errorMessage, 'error');
            console.error('Deployment error:', error);
        }
    };

    const isSubmitting = status === 'uploading' || status === 'deploying';
    const canSubmit = formData.name && formData.symbol && formData.initialSupply && formData.logo;

    return (
        <div className="max-w-2xl mx-auto p-6">
            <Card>
                <h1 className="text-3xl font-bold mb-6">Deploy Your Token</h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Token Name */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Token Name
                            <span className="text-red-500 ml-1">*</span>
                        </label>
                        <Input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                name: e.target.value 
                            }))}
                            placeholder="e.g., My Awesome Token"
                            disabled={isSubmitting}
                            required
                            maxLength={32}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            1-32 characters, alphanumeric with spaces and hyphens
                        </p>
                    </div>

                    {/* Token Symbol */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Token Symbol
                            <span className="text-red-500 ml-1">*</span>
                        </label>
                        <Input
                            type="text"
                            value={formData.symbol}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                symbol: e.target.value.toUpperCase() 
                            }))}
                            placeholder="e.g., MAT"
                            disabled={isSubmitting}
                            required
                            maxLength={12}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            1-12 uppercase letters
                        </p>
                    </div>

                    {/* Decimals */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Decimals
                        </label>
                        <Input
                            type="number"
                            value={formData.decimals}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                decimals: parseInt(e.target.value) 
                            }))}
                            min={0}
                            max={18}
                            disabled={isSubmitting}
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Number of decimal places (0-18)
                        </p>
                    </div>

                    {/* Initial Supply */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Initial Supply
                            <span className="text-red-500 ml-1">*</span>
                        </label>
                        <Input
                            type="text"
                            value={formData.initialSupply}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                initialSupply: e.target.value 
                            }))}
                            placeholder="e.g., 1000000"
                            disabled={isSubmitting}
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Total number of tokens to create
                        </p>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Description
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ 
                                ...prev, 
                                description: e.target.value 
                            }))}
                            placeholder="Describe your token..."
                            disabled={isSubmitting}
                            maxLength={500}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {formData.description.length}/500 characters
                        </p>
                    </div>

                    {/* Token Logo */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Token Logo
                            <span className="text-red-500 ml-1">*</span>
                        </label>
                        <ImageUpload
                            onImageSelect={handleImageSelect}
                            onImageRemove={handleImageRemove}
                            currentImage={formData.logo}
                            disabled={isSubmitting}
                        />
                    </div>

                    {/* Upload Progress */}
                    {status === 'uploading' && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-blue-900">
                                    Uploading to IPFS...
                                </span>
                                <span className="text-sm font-medium text-blue-900">
                                    {uploadProgress}%
                                </span>
                            </div>
                            <div className="w-full bg-blue-200 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* IPFS URL */}
                    {ipfsUrl && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <p className="text-sm font-medium text-green-900 mb-1">
                                ✓ Image uploaded to IPFS
                            </p>
                            <a
                                href={ipfsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-green-700 hover:text-green-800 underline break-all"
                            >
                                {ipfsUrl}
                            </a>
                        </div>
                    )}

                    {/* Status Messages */}
                    {status === 'deploying' && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-sm font-medium text-yellow-900">
                                Deploying token to blockchain...
                            </p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <p className="text-sm font-medium text-green-900">
                                ✓ Token deployed successfully!
                            </p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-sm font-medium text-red-900">
                                ✗ Deployment failed. Please try again.
                            </p>
                        </div>
                    )}

                    {/* Submit Button */}
                    <Button
                        type="submit"
                        disabled={!canSubmit || isSubmitting}
                        className="w-full"
                        size="lg"
                    >
                        {status === 'uploading' && 'Uploading to IPFS...'}
                        {status === 'deploying' && 'Deploying Token...'}
                        {status === 'success' && 'Deployed Successfully!'}
                        {(status === 'idle' || status === 'error') && 'Deploy Token'}
                    </Button>
                </form>
            </Card>
        </div>
    );
}

// Mock deployment function
async function deployToken(params: {
    name: string;
    symbol: string;
    decimals: number;
    initialSupply: string;
    metadata: {
        name: string;
        description: string;
        image: string;
    };
}): Promise<void> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In real implementation, this would call the smart contract
    console.log('Deploying token with params:', params);
}

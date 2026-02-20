import { useState } from 'react';
import { ImageUpload } from '../UI/ImageUpload';
import { Button } from '../UI/Button';
import { uploadToIPFS } from '../../services/IPFSService';
import type { ImageValidationResult } from '../../utils/imageValidation';

interface LogoUploadStepProps {
  onNext: (data: LogoData) => void;
  onBack: () => void;
  initialData?: LogoData;
  tokenName?: string;
  tokenSymbol?: string;
}

export interface LogoData {
  file: File | null;
  ipfsHash?: string;
  ipfsUrl?: string;
}

export function LogoUploadStep({
  onNext,
  onBack,
  initialData,
  tokenName,
  tokenSymbol,
}: LogoUploadStepProps) {
  const [logoData, setLogoData] = useState<LogoData>(
    initialData || { file: null }
  );
  const [validationResult, setValidationResult] = useState<ImageValidationResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImageSelect = (file: File, result: ImageValidationResult) => {
    setLogoData({ file });
    setValidationResult(result);
    setUploadError(null);
  };

  const handleImageRemove = () => {
    setLogoData({ file: null });
    setValidationResult(null);
    setUploadError(null);
  };

  const handleSkip = () => {
    onNext({ file: null });
  };

  const handleUpload = async () => {
    if (!logoData.file || !validationResult) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await uploadToIPFS(logoData.file, validationResult, {
        name: `${tokenName || 'Token'} Logo`,
        keyvalues: {
          tokenName: tokenName || '',
          tokenSymbol: tokenSymbol || '',
        },
      });

      if (result.success) {
        onNext({
          file: logoData.file,
          ipfsHash: result.ipfsHash,
          ipfsUrl: result.ipfsUrl,
        });
      } else {
        setUploadError(result.error || 'Upload failed');
      }
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'An unexpected error occurred'
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Upload Token Logo
        </h2>
        <p className="text-gray-600">
          Add a logo for your token. This step is optional but recommended for better
          recognition.
        </p>
      </div>

      <ImageUpload
        onImageSelect={handleImageSelect}
        onImageRemove={handleImageRemove}
        label="Token Logo"
        helperText="Upload PNG, JPG, or SVG (max 5MB, recommended 512x512px)"
      />

      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-sm font-medium text-red-800">Upload Error</p>
          <p className="text-sm text-red-700 mt-1">{uploadError}</p>
        </div>
      )}

      {validationResult?.warnings && validationResult.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <p className="text-sm font-medium text-yellow-800 mb-2">
            Image Quality Notice
          </p>
          <ul className="text-sm text-yellow-700 space-y-1">
            {validationResult.warnings.map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isUploading}
          className="flex-1"
        >
          Back
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={handleSkip}
          disabled={isUploading}
          className="flex-1"
        >
          Skip Logo
        </Button>

        <Button
          type="button"
          variant="primary"
          onClick={handleUpload}
          disabled={!logoData.file || isUploading}
          className="flex-1"
        >
          {isUploading ? 'Uploading...' : 'Upload & Continue'}
        </Button>
      </div>

      {tokenName && tokenSymbol && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Token:</span> {tokenName} ({tokenSymbol})
          </p>
        </div>
      )}
    </div>
  );
}

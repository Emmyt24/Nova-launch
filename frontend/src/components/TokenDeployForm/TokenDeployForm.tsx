import { useMemo, useState } from 'react';
import type { DeploymentResult, TokenDeployParams, WalletState } from '../../types';
import { useTokenDeploy } from '../../hooks/useTokenDeploy';
import { formatXLM, truncateAddress } from '../../utils/formatting';
import { BasicInfoStep, type BasicInfoData } from './BasicInfoStep';
import { FeeDisplay } from './FeeDisplay';
import { Button } from '../UI/Button';
import { analytics } from '../../services/analytics';
import { Input } from '../UI/Input';

interface TokenDeployFormProps {
    wallet: WalletState;
    onConnectWallet: () => Promise<void>;
    isConnectingWallet: boolean;
}

type FormStep = 'basic' | 'review';

export function TokenDeployForm({
    wallet,
    onConnectWallet,
    isConnectingWallet,
}: TokenDeployFormProps) {
    const [step, setStep] = useState<FormStep>('basic');
    const [basicInfo, setBasicInfo] = useState<BasicInfoData | null>(null);
    const [metadataDescription, setMetadataDescription] = useState('');
    const [metadataImage, setMetadataImage] = useState<File | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [result, setResult] = useState<DeploymentResult | null>(null);

    const { deploy, reset, status, statusMessage, isDeploying, error, getFeeBreakdown } =
        useTokenDeploy(wallet.network);

    const hasMetadataInput = Boolean(metadataDescription.trim() || metadataImage);
    const feeBreakdown = useMemo(
        () => getFeeBreakdown(hasMetadataInput),
        [getFeeBreakdown, hasMetadataInput]
    );

    const handleBasicNext = (data: BasicInfoData) => {
        setBasicInfo(data);
        setStep('review');
        setResult(null);
        setLocalError(null);
        reset();
    };

    const handleDeploy = async () => {
        if (!basicInfo) {
            return;
        }

        if (!wallet.connected || !wallet.address) {
            setLocalError('Connect your wallet before deploying.');
            return;
        }

        if (wallet.address !== basicInfo.adminWallet) {
            setLocalError('Admin wallet must match the connected wallet address.');
            return;
        }

        if (hasMetadataInput && (!metadataImage || !metadataDescription.trim())) {
            setLocalError('Provide both metadata image and description, or leave both empty.');
            return;
        }

        setLocalError(null);

        const params: TokenDeployParams = {
            ...basicInfo,
            metadata: hasMetadataInput
                ? {
                    image: metadataImage as File,
                    description: metadataDescription.trim(),
                }
                : undefined,
        };

        try {
            try {
                analytics.track('deploy_button_click', { network: wallet.network });
            } catch {}

            const deployment = await deploy(params);
            setResult(deployment);
        } catch {
            setResult(null);
        }
    };

    const handleRetry = async () => {
        reset();
        try {
            analytics.track('deploy_retry', { network: wallet.network });
        } catch {}
        await handleDeploy();
    };

    const resetForm = () => {
        setStep('basic');
        setBasicInfo(null);
        setMetadataDescription('');
        setMetadataImage(null);
        setLocalError(null);
        setResult(null);
        reset();
        try {
            analytics.track('deploy_another_reset');
        } catch {}
    };

    if (result && status === 'success') {
        return (
            <div className="space-y-6" data-testid="deployment-success">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <h3 className="text-lg font-semibold text-green-800">Token Deployed</h3>
                    <p className="mt-2 text-sm text-green-700">
                        Deployment completed successfully on {wallet.network}.
                    </p>
                </div>

                <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Token Address</p>
                        <p className="break-all text-sm font-medium text-gray-900">{result.tokenAddress}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Transaction Hash</p>
                        <p className="break-all text-sm text-gray-900">{result.transactionHash}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Total Fee</p>
                        <p className="text-sm text-gray-900">{formatXLM(feeBreakdown.totalFee)} XLM</p>
                    </div>
                </div>

                <Button onClick={resetForm} className="w-full">
                    Deploy Another Token
                </Button>
            </div>
        );
    }

    if (step === 'basic') {
        return (
            <div data-tutorial="token-form">
                <BasicInfoStep
                    onNext={handleBasicNext}
                    initialData={
                        wallet.address
                            ? {
                                name: basicInfo?.name || '',
                                symbol: basicInfo?.symbol || '',
                                decimals: basicInfo?.decimals ?? 7,
                                initialSupply: basicInfo?.initialSupply || '',
                                adminWallet: basicInfo?.adminWallet || wallet.address,
                            }
                            : basicInfo || undefined
                    }
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-base font-semibold text-gray-900">Review & Deploy</h3>
                <p className="mt-2 text-sm text-gray-600">
                    Wallet:{' '}
                    {wallet.connected && wallet.address
                        ? `${truncateAddress(wallet.address)} (${wallet.network})`
                        : 'Not connected'}
                </p>
            </div>

            {!wallet.connected ? (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                    <p className="text-sm text-yellow-800">Connect your wallet to continue deployment.</p>
                    <Button
                        className="mt-3"
                        onClick={() => void onConnectWallet()}
                        loading={isConnectingWallet}
                    >
                        Connect Wallet
                    </Button>
                </div>
            ) : null}

            <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                <h4 className="font-medium text-gray-900">Optional Metadata</h4>
                <Input
                    value={metadataDescription}
                    onChange={(event) => {
                        const v = event.target.value;
                        setMetadataDescription(v);
                        try {
                            if (v.trim()) analytics.track('metadata_description_added', { length: v.length });
                        } catch {}
                    }}
                    label="Description"
                    placeholder="Describe your token"
                    maxLength={500}
                />
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Token Image</label>
                    <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                        onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            setMetadataImage(file);
                            try {
                                if (file) analytics.track('metadata_image_added', { size: file.size, type: file.type });
                            } catch {}
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">PNG, JPG, SVG up to 5MB.</p>
                </div>
            </div>

            <FeeDisplay feeBreakdown={feeBreakdown} hasMetadata={hasMetadataInput} />

            {status === 'error' && error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
                    <h4 className="font-medium text-red-800">Deployment Failed</h4>
                    <p className="mt-2 text-sm text-red-700">
                        {error.details ? `${error.message}: ${error.details}` : error.message}
                    </p>
                    <Button className="mt-3" variant="danger" onClick={() => void handleRetry()}>
                        Retry Deployment
                    </Button>
                </div>
            ) : null}

            {localError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
                    <p className="text-sm text-red-700">{localError}</p>
                </div>
            ) : null}

            {isDeploying ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm text-blue-800">{statusMessage}</p>
                </div>
            ) : null}

            <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('basic')} className="w-full">
                    Back
                </Button>
                <Button
                    onClick={() => void handleDeploy()}
                    loading={isDeploying}
                    className="w-full"
                    disabled={!wallet.connected}
                    data-tutorial="deploy-button"
                >
                    Deploy Token
                </Button>
            </div>
        </div>
    );
}

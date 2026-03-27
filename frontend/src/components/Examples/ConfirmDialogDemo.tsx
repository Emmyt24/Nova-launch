import { useState } from 'react';
import { Button, ConfirmDialog } from '../UI';
import type { ConfirmDialogAction, FeeItem } from '../UI/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

export function ConfirmDialogDemo() {
    const [result, setResult] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Manual state management example
    const [manualDialogOpen, setManualDialogOpen] = useState(false);
    const [manualDialogAction, setManualDialogAction] = useState<ConfirmDialogAction>('deploy');

    // Hook-based example
    const { isOpen, options, confirm, handleConfirm, handleCancel } = useConfirmDialog();

    const handleDeploymentConfirm = () => {
        setManualDialogAction('deploy');
        setManualDialogOpen(true);
    };

    const handleMintConfirm = async () => {
        const confirmed = await confirm({
            title: 'Mint Tokens',
            message: 'You are about to mint 1,000,000 new tokens. This action will increase the total supply.',
            action: 'mint',
            fees: [
                { label: 'Transaction Fee', amount: '0.00001 XLM' },
                { label: 'Network Fee', amount: '0.00005 XLM' },
            ],
            consequences: [
                'Total supply will increase by 1,000,000 tokens',
                'This action cannot be undone',
                'Gas fees will be deducted from your wallet',
            ],
            confirmText: 'Mint Tokens',
            confirmButtonVariant: 'primary',
        });

        if (confirmed) {
            setResult('Minting tokens...');
            // Simulate minting
            setTimeout(() => setResult('Tokens minted successfully!'), 1500);
        } else {
            setResult('Minting cancelled');
        }
    };

    const handleBurnConfirm = async () => {
        const confirmed = await confirm({
            title: 'Burn Tokens',
            message: 'You are about to permanently burn 500 tokens. This action is irreversible.',
            action: 'burn',
            fees: [
                { label: 'Transaction Fee', amount: '0.00001 XLM' },
            ],
            consequences: [
                'Tokens will be permanently destroyed',
                'This action cannot be undone',
                'Total supply will decrease',
            ],
            confirmText: 'Burn Tokens',
            confirmButtonVariant: 'danger',
            requireExplicitConfirm: true,
        });

        if (confirmed) {
            setResult('Burning tokens...');
            setTimeout(() => setResult('Tokens burned successfully!'), 1500);
        } else {
            setResult('Burn cancelled');
        }
    };

    const handleNetworkSwitch = async () => {
        const confirmed = await confirm({
            title: 'Switch Network',
            message: 'Switching to Mainnet will disconnect your current wallet connection.',
            action: 'network-switch',
            consequences: [
                'Your wallet will be disconnected',
                'You will need to reconnect on the new network',
                'Pending transactions may be lost',
            ],
            confirmText: 'Switch Network',
            confirmButtonVariant: 'primary',
        });

        if (confirmed) {
            setResult('Switching network...');
            setTimeout(() => setResult('Network switched successfully!'), 1500);
        } else {
            setResult('Network switch cancelled');
        }
    };

    const handleMetadataUpload = async () => {
        const confirmed = await confirm({
            title: 'Upload Metadata',
            message: 'Upload token metadata to IPFS and update the contract.',
            action: 'metadata-upload',
            fees: [
                { label: 'IPFS Storage', amount: '0.00010 XLM', description: 'Permanent storage on IPFS' },
                { label: 'Contract Update', amount: '0.00015 XLM', description: 'Update metadata URI' },
            ],
            consequences: [
                'Metadata will be publicly accessible',
                'Old metadata will be replaced',
            ],
            confirmText: 'Upload & Update',
            confirmButtonVariant: 'primary',
        });

        if (confirmed) {
            setResult('Uploading metadata...');
            setTimeout(() => setResult('Metadata uploaded successfully!'), 1500);
        } else {
            setResult('Upload cancelled');
        }
    };

    const handleManualConfirm = async () => {
        setIsProcessing(true);
        setResult('Processing deployment...');
        
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setIsProcessing(false);
        setManualDialogOpen(false);
        setResult('Token deployed successfully!');
    };

    const deploymentFees: FeeItem[] = [
        { label: 'Base Fee', amount: '0.00001 XLM', description: 'Network transaction fee' },
        { label: 'Contract Deployment', amount: '0.00010 XLM', description: 'Smart contract creation' },
        { label: 'Metadata Storage', amount: '0.00004 XLM', description: 'IPFS storage cost' },
    ];

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Confirmation Dialog Examples</h1>
                <p className="text-gray-600">
                    Interactive examples of confirmation dialogs for destructive and expensive actions.
                </p>
            </div>

            {/* Result Display */}
            {result && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-900 font-medium">{result}</p>
                </div>
            )}

            {/* Examples Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Token Deployment</h3>
                    <p className="text-sm text-gray-600">
                        Deploy a new token with fee breakdown and consequences.
                    </p>
                    <Button onClick={handleDeploymentConfirm} variant="primary" className="w-full">
                        Deploy Token
                    </Button>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Token Minting</h3>
                    <p className="text-sm text-gray-600">
                        Mint new tokens with fee breakdown using the hook pattern.
                    </p>
                    <Button onClick={handleMintConfirm} variant="primary" className="w-full">
                        Mint Tokens
                    </Button>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Token Burning</h3>
                    <p className="text-sm text-gray-600">
                        Burn tokens with explicit confirmation requirement.
                    </p>
                    <Button onClick={handleBurnConfirm} variant="danger" className="w-full">
                        Burn Tokens
                    </Button>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Network Switch</h3>
                    <p className="text-sm text-gray-600">
                        Switch networks with wallet disconnection warning.
                    </p>
                    <Button onClick={handleNetworkSwitch} variant="primary" className="w-full">
                        Switch Network
                    </Button>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Metadata Upload</h3>
                    <p className="text-sm text-gray-600">
                        Upload metadata with detailed fee breakdown.
                    </p>
                    <Button onClick={handleMetadataUpload} variant="primary" className="w-full">
                        Upload Metadata
                    </Button>
                </div>
            </div>

            {/* Manual Dialog Example */}
            <ConfirmDialog
                isOpen={manualDialogOpen}
                onClose={() => setManualDialogOpen(false)}
                onConfirm={handleManualConfirm}
                title="Deploy Token"
                message="You are about to deploy a new token to the Stellar network. This will cost network fees."
                action={manualDialogAction}
                fees={deploymentFees}
                consequences={[
                    'Token will be deployed to the blockchain',
                    'Transaction fees will be deducted from your wallet',
                    'Token address will be generated',
                    'This action cannot be undone',
                ]}
                confirmText="Deploy Now"
                cancelText="Cancel"
                confirmButtonVariant="primary"
                isProcessing={isProcessing}
            />

            {/* Hook-based Dialog */}
            {options && (
                <ConfirmDialog
                    isOpen={isOpen}
                    onClose={handleCancel}
                    onConfirm={handleConfirm}
                    {...options}
                />
            )}

            {/* Code Examples */}
            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">Usage Examples</h2>
                
                <div className="space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">1. Using the Hook (Recommended)</h3>
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
{`const { isOpen, options, confirm, handleConfirm, handleCancel } = useConfirmDialog();

const handleAction = async () => {
  const confirmed = await confirm({
    title: 'Deploy Token',
    message: 'Deploy your token to the blockchain?',
    action: 'deploy',
    fees: [{ label: 'Gas Fee', amount: '0.00015 XLM' }],
    consequences: ['Action cannot be undone'],
  });

  if (confirmed) {
    // Proceed with action
  }
};

// Render the dialog
{options && (
  <ConfirmDialog
    isOpen={isOpen}
    onClose={handleCancel}
    onConfirm={handleConfirm}
    {...options}
  />
)}`}
                        </pre>
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">2. Manual State Management</h3>
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
{`const [isOpen, setIsOpen] = useState(false);

<ConfirmDialog
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onConfirm={async () => {
    // Handle confirmation
    setIsOpen(false);
  }}
  title="Confirm Action"
  message="Are you sure?"
  action="custom"
/>`}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}

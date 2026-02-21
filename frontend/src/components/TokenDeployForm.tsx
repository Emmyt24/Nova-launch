import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Input, Card, SuccessModal } from './UI';
import type { DeploymentResult } from '../types';

export function TokenDeployForm() {
    const [isDeploying, setIsDeploying] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [deploymentData, setDeploymentData] = useState<{
        tokenName: string;
        tokenSymbol: string;
        tokenAddress: string;
        result?: DeploymentResult;
    } | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        symbol: '',
        decimals: '7',
        initialSupply: '',
    });

    const handleDeploy = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsDeploying(true);

        // Simulate deployment
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const mockAddress = `C${Array.from({ length: 55 }, () =>
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[Math.floor(Math.random() * 32)]
        ).join('')}`;

        const mockResult: DeploymentResult = {
            tokenAddress: mockAddress,
            transactionHash: `${Array.from({ length: 64 }, () =>
                '0123456789abcdef'[Math.floor(Math.random() * 16)]
            ).join('')}`,
            totalFee: '0.00015',
            timestamp: Date.now(),
        };

        setDeploymentData({
            tokenName: formData.name,
            tokenSymbol: formData.symbol,
            tokenAddress: mockAddress,
            result: mockResult,
        });

        setIsDeploying(false);
        setShowSuccess(true);
    };

    const handleCloseSuccess = () => {
        setShowSuccess(false);
        setFormData({ name: '', symbol: '', decimals: '7', initialSupply: '' });
    };

    return (
        <>
            <Card title="Deploy Your Token">
                <form onSubmit={handleDeploy} className="space-y-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Input
                            label="Token Name"
                            placeholder="e.g., My Awesome Token"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                            disabled={isDeploying}
                        />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Input
                            label="Token Symbol"
                            placeholder="e.g., MAT"
                            value={formData.symbol}
                            onChange={(e) =>
                                setFormData({ ...formData, symbol: e.target.value.toUpperCase() })
                            }
                            maxLength={12}
                            required
                            disabled={isDeploying}
                        />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <Input
                            label="Decimals"
                            type="number"
                            min="0"
                            max="18"
                            value={formData.decimals}
                            onChange={(e) => setFormData({ ...formData, decimals: e.target.value })}
                            required
                            disabled={isDeploying}
                        />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <Input
                            label="Initial Supply"
                            type="number"
                            placeholder="e.g., 1000000"
                            value={formData.initialSupply}
                            onChange={(e) =>
                                setFormData({ ...formData, initialSupply: e.target.value })
                            }
                            required
                            disabled={isDeploying}
                        />
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="pt-4"
                    >
                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            loading={isDeploying}
                            disabled={
                                !formData.name ||
                                !formData.symbol ||
                                !formData.initialSupply ||
                                isDeploying
                            }
                            className="w-full"
                        >
                            {isDeploying ? 'Deploying Token...' : 'Deploy Token'}
                        </Button>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-center text-sm text-gray-500"
                    >
                        <p>Estimated fee: ~0.00015 XLM</p>
                    </motion.div>
                </form>
            </Card>

            {deploymentData && (
                <SuccessModal
                    isOpen={showSuccess}
                    onClose={handleCloseSuccess}
                    tokenName={deploymentData.tokenName}
                    tokenSymbol={deploymentData.tokenSymbol}
                    tokenAddress={deploymentData.tokenAddress}
                    deploymentResult={deploymentData.result}
                />
            )}
        </>
    );
}

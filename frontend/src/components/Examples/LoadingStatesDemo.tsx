import { useState } from 'react';
import {
    Spinner,
    Skeleton,
    SkeletonCard,
    SkeletonList,
    ProgressBar,
    LoadingOverlay,
    LoadingButton,
    Button,
    Card,
} from '../UI';

export function LoadingStatesDemo() {
    const [showOverlay, setShowOverlay] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const simulateProgress = () => {
        setProgress(0);
        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 10;
            });
        }, 500);
    };

    const simulateLoading = async () => {
        setIsLoading(true);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        setIsLoading(false);
    };

    return (
        <div className="space-y-8 p-6">
            <h1 className="text-3xl font-bold text-gray-900">Loading States Demo</h1>

            {/* Spinners */}
            <Card title="Spinners">
                <div className="flex items-center gap-8">
                    <div className="text-center">
                        <Spinner size="sm" />
                        <p className="mt-2 text-sm text-gray-600">Small</p>
                    </div>
                    <div className="text-center">
                        <Spinner size="md" />
                        <p className="mt-2 text-sm text-gray-600">Medium</p>
                    </div>
                    <div className="text-center">
                        <Spinner size="lg" />
                        <p className="mt-2 text-sm text-gray-600">Large</p>
                    </div>
                </div>
            </Card>

            {/* Skeleton Loaders */}
            <Card title="Skeleton Loaders">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-3">Text Skeleton</h3>
                        <div className="space-y-2">
                            <Skeleton width="100%" />
                            <Skeleton width="80%" />
                            <Skeleton width="60%" />
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-3">Card Skeleton</h3>
                        <SkeletonCard />
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-3">List Skeleton</h3>
                        <SkeletonList count={2} variant="row" />
                    </div>
                </div>
            </Card>

            {/* Progress Bars */}
            <Card title="Progress Bars">
                <div className="space-y-6">
                    <div>
                        <Button onClick={simulateProgress} size="sm" className="mb-4">
                            Simulate Progress
                        </Button>
                        <ProgressBar
                            progress={progress}
                            label="Upload Progress"
                            showPercentage={true}
                            estimatedTimeMs={progress < 100 ? (100 - progress) * 100 : 0}
                        />
                    </div>

                    <ProgressBar progress={25} label="Small Progress" size="sm" />
                    <ProgressBar progress={50} label="Medium Progress" size="md" variant="warning" />
                    <ProgressBar progress={75} label="Large Progress" size="lg" variant="success" />
                    <ProgressBar progress={90} label="Danger Progress" variant="danger" />
                </div>
            </Card>

            {/* Loading Buttons */}
            <Card title="Loading Buttons">
                <div className="flex flex-wrap gap-4">
                    <LoadingButton
                        loading={isLoading}
                        loadingText="Processing..."
                        onClick={simulateLoading}
                    >
                        Click to Load
                    </LoadingButton>

                    <LoadingButton
                        loading={true}
                        variant="secondary"
                    >
                        Loading State
                    </LoadingButton>

                    <LoadingButton
                        loading={true}
                        variant="danger"
                        size="sm"
                    >
                        Small Loading
                    </LoadingButton>

                    <LoadingButton
                        loading={true}
                        variant="outline"
                        size="lg"
                    >
                        Large Loading
                    </LoadingButton>
                </div>
            </Card>

            {/* Loading Overlay */}
            <Card title="Loading Overlay">
                <Button onClick={() => setShowOverlay(!showOverlay)}>
                    Toggle Overlay
                </Button>

                <LoadingOverlay
                    isLoading={showOverlay}
                    message="Processing your request..."
                    progress={60}
                    estimatedTimeMs={5000}
                >
                    <div className="mt-4 p-8 bg-gray-100 rounded-lg">
                        <h3 className="text-lg font-semibold mb-2">Content Area</h3>
                        <p className="text-gray-600">
                            This content will be overlaid when loading is active.
                        </p>
                    </div>
                </LoadingOverlay>
            </Card>

            {/* Real-world Examples */}
            <Card title="Real-world Scenarios">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-3">
                            Wallet Connection
                        </h3>
                        <LoadingButton
                            loading={true}
                            loadingText="Connecting..."
                            className="w-full"
                        >
                            Connect Wallet
                        </LoadingButton>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-3">
                            Token Deployment
                        </h3>
                        <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm font-medium text-blue-800">
                                Deploying token...
                            </p>
                            <ProgressBar
                                progress={45}
                                label="Uploading metadata to IPFS"
                                showPercentage={true}
                                estimatedTimeMs={8000}
                            />
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-3">
                            Transaction Monitoring
                        </h3>
                        <div className="space-y-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center gap-2">
                                <Spinner size="sm" />
                                <p className="text-sm font-medium text-yellow-800">
                                    Waiting for confirmation...
                                </p>
                            </div>
                            <ProgressBar
                                progress={65}
                                showPercentage={false}
                                estimatedTimeMs={12000}
                            />
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-3">
                            Loading Token List
                        </h3>
                        <SkeletonList count={3} variant="card" />
                    </div>
                </div>
            </Card>
        </div>
    );
}

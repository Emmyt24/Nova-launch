import { useEffect, useState } from "react";
import { Header, Container } from "../components/Layout";
import { Button, Card, ErrorBoundary } from "../components/UI";
import {
  PWAInstallButton,
  PWAUpdateNotification,
  PWAConnectionStatus,
} from "../components/PWA";
import { TokenDeployForm } from "../components/TokenDeployForm";
import {
  TutorialOverlay,
  CompletionCelebration,
  TutorialSettings,
  useTutorial,
  deploymentTutorialSteps,
} from "../components/Tutorial";
import { WalletInfo, NetworkToggle } from "../components/WalletConnect";
import type { WalletState } from "../types";

interface DeployPageProps {
  network: "testnet" | "mainnet";
  setNetwork: (network: "testnet" | "mainnet") => void;
  wallet: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  error: string | null;
}

export default function DeployPage({
  network,
  setNetwork,
  wallet,
  connect,
  disconnect,
  isConnecting,
  error,
}: DeployPageProps) {
  const [showCelebration, setShowCelebration] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const tutorial = useTutorial(deploymentTutorialSteps);

  const handleTutorialComplete = () => {
    tutorial.complete();
    setShowCelebration(true);
  };

  const handleCelebrationClose = () => {
    setShowCelebration(false);
  };

  useEffect(() => {
    if (!tutorial.hasCompletedBefore) {
      const timer = setTimeout(() => {
        tutorial.start();
      }, 1000);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [tutorial.hasCompletedBefore]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <Header>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
            <PWAConnectionStatus />
            <PWAInstallButton />
            {!tutorial.hasCompletedBefore && (
              <Button
                variant="outline"
                size="sm"
                onClick={tutorial.start}
                data-tutorial="restart-tutorial"
              >
                Start Tutorial
              </Button>
            )}
            {tutorial.hasCompletedBefore && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(true)}
                title="Tutorial settings"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </Button>
            )}
            <NetworkToggle network={network} onNetworkChange={setNetwork} />
            {wallet.connected && wallet.address ? (
              <WalletInfo
                wallet={wallet}
                onDisconnect={disconnect}
                data-tutorial="connect-wallet"
              />
            ) : (
              <Button
                size="sm"
                onClick={() => void connect()}
                loading={isConnecting}
                data-tutorial="connect-wallet"
              >
                Connect Wallet
              </Button>
            )}
          </div>
        </Header>
        <main id="main-content">
          <Container>
            <Card title="Deploy Your Token">
              {error ? (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              <TokenDeployForm
                wallet={wallet}
                onConnectWallet={connect}
                isConnectingWallet={isConnecting}
              />
            </Card>
          </Container>
        </main>
        <PWAUpdateNotification />

        <TutorialOverlay
          steps={deploymentTutorialSteps}
          currentStep={tutorial.currentStep}
          onNext={tutorial.next}
          onPrevious={tutorial.previous}
          onSkip={tutorial.skip}
          onComplete={handleTutorialComplete}
          isActive={tutorial.isActive}
        />
        <CompletionCelebration isOpen={showCelebration} onClose={handleCelebrationClose} />
        <TutorialSettings
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onResetTutorial={tutorial.reset}
        />
      </div>
    </ErrorBoundary>
  );
}

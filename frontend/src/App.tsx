import { Header, Container } from "./components/Layout";
import { Button, Card, ErrorBoundary } from "./components/UI";
import {
  PWAInstallButton,
  PWAUpdateNotification,
  PWAConnectionStatus,
} from "./components/PWA";
import { TokenDeployForm } from "./components/TokenDeployForm";
import { useWallet } from "./hooks/useWallet";
import { truncateAddress } from "./utils/formatting";

function App() {
  const { wallet, connect, disconnect, isConnecting, error } = useWallet();

  return (
    <ErrorBoundary>
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>
      <div className="min-h-screen bg-gray-50">
        <Header>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
            <PWAConnectionStatus />
            <PWAInstallButton />
            {wallet.connected && wallet.address ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled>
                  {truncateAddress(wallet.address)}
                </Button>
                <Button variant="outline" size="sm" onClick={disconnect}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => void connect()}
                loading={isConnecting}
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
      </div>
    </ErrorBoundary>
  );
}

export default App;

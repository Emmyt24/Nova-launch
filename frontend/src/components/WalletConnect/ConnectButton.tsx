import { useState, useCallback } from "react";
import { LoadingButton } from "../UI";
import { useToast } from "../../hooks/useToast";

interface ConnectButtonProps {
  onConnect?: (publicKey: string) => void;
  onError?: (error: Error) => void;
  className?: string;
}

interface FreighterResponse {
  publicKey: string;
}

declare global {
  interface Window {
    freighter?: {
      requestPublicKey: () => Promise<FreighterResponse>;
    };
  }
}

export function ConnectButton({
  onConnect,
  onError,
  className = "",
}: ConnectButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { success, error: errorToast, info } = useToast();

  const checkFreighterInstalled = useCallback((): boolean => {
    return typeof window.freighter !== "undefined";
  }, []);

  const handleConnect = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if Freighter is installed
      if (!checkFreighterInstalled()) {
        const errorMessage =
          "Freighter wallet not installed. Please install the Freighter extension.";
        setError(errorMessage);
        errorToast(errorMessage);
        onError?.(new Error(errorMessage));
        setIsLoading(false);
        return;
      }

      // Request connection from Freighter
      const response = await window.freighter?.requestPublicKey();

      if (response && response.publicKey) {
        setIsConnected(true);
        setPublicKey(response.publicKey);
        success(`Wallet connected: ${response.publicKey.slice(0, 8)}...`);
        onConnect?.(response.publicKey);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to connect wallet. Please try again.";
      setError(errorMessage);
      errorToast(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [checkFreighterInstalled, onConnect, onError, success, errorToast]);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setPublicKey(null);
    setError(null);
    info("Wallet disconnected");
  }, [info]);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {isConnected && publicKey ? (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            className="hidden sm:inline-flex cursor-default"
            aria-label={`Connected wallet: ${publicKey}`}
            title={publicKey}
            disabled
          >
            {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="sm:hidden cursor-default"
            aria-label="Connected wallet"
            title={publicKey}
            disabled
          >
            Connected
          </Button>
          <Button
            onClick={handleDisconnect}
            variant="outline"
            size="md"
            className="hidden sm:inline-flex"
            aria-label="Disconnect wallet"
          >
            Disconnect
          </Button>
          <Button
            onClick={handleDisconnect}
            variant="outline"
            size="sm"
            className="sm:hidden"
            aria-label="Disconnect wallet"
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <LoadingButton
          onClick={handleConnect}
          loading={isLoading}
          loadingText="Connecting..."
          disabled={!!error}
          size="md"
          aria-label={isLoading ? "Connecting..." : "Connect Wallet"}
          aria-describedby={error ? "wallet-error" : undefined}
        >
          Connect Wallet
        </LoadingButton>
      )}

      {error && (
        <div
          id="wallet-error"
          className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2"
          role="alert"
          aria-live="polite"
        >
          <p className="font-medium">Connection Error</p>
          <p className="text-xs mt-1">{error}</p>
          {error.includes("Freighter") && (
            <a
              href="https://freighter.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-700 hover:text-red-800 underline text-xs mt-2 inline-block"
              aria-label="Install Freighter wallet"
            >
              Install Freighter →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

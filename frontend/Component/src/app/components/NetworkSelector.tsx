import React, { useState, useEffect } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Alert, AlertDescription } from "./ui/alert";
import { ChevronDown, Globe, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export type NetworkType = "testnet" | "mainnet" | "custom";

export interface NetworkConfig {
  id: NetworkType;
  name: string;
  horizonUrl: string;
  networkPassphrase: string;
  badgeColor: "default" | "secondary" | "destructive" | "outline";
  badgeClassName?: string;
}

export interface NetworkSelectorProps {
  onNetworkChange?: (network: NetworkConfig) => void;
  defaultNetwork?: NetworkType;
  customNetworkConfig?: Partial<NetworkConfig>;
}

const NETWORKS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    id: "testnet",
    name: "Testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    badgeColor: "secondary",
    badgeClassName: "bg-yellow-500 text-white hover:bg-yellow-600",
  },
  mainnet: {
    id: "mainnet",
    name: "Mainnet",
    horizonUrl: "https://horizon.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    badgeColor: "default",
    badgeClassName: "bg-green-600 text-white hover:bg-green-700",
  },
  custom: {
    id: "custom",
    name: "Custom Network",
    horizonUrl: "https://custom-horizon.example.com",
    networkPassphrase: "Custom Network",
    badgeColor: "outline",
    badgeClassName: "bg-blue-600 text-white hover:bg-blue-700",
  },
};

const STORAGE_KEY = "stellar-network-selection";

export function NetworkSelector({
  onNetworkChange,
  defaultNetwork = "testnet",
  customNetworkConfig,
}: NetworkSelectorProps) {
  const [currentNetwork, setCurrentNetwork] = useState<NetworkConfig>(() => {
    // Try to load from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const networkId = JSON.parse(stored) as NetworkType;
        return NETWORKS[networkId] || NETWORKS[defaultNetwork];
      } catch {
        return NETWORKS[defaultNetwork];
      }
    }
    return NETWORKS[defaultNetwork];
  });

  const [pendingNetwork, setPendingNetwork] = useState<NetworkConfig | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [error, setError] = useState<string | null>(null);

  // Check network connectivity
  useEffect(() => {
    const checkNetworkStatus = async () => {
      setConnectionStatus("checking");
      setError(null);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(currentNetwork.horizonUrl, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          setConnectionStatus("connected");
        } else {
          setConnectionStatus("disconnected");
          setError("Network responded with an error");
        }
      } catch (err) {
        setConnectionStatus("disconnected");
        setError(err instanceof Error ? err.message : "Failed to connect to network");
      }
    };

    checkNetworkStatus();
    
    // Re-check every 30 seconds
    const interval = setInterval(checkNetworkStatus, 30000);
    return () => clearInterval(interval);
  }, [currentNetwork]);

  // Persist network selection
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentNetwork.id));
  }, [currentNetwork]);

  const handleNetworkSelect = (networkId: NetworkType) => {
    const network = networkId === "custom" && customNetworkConfig
      ? { ...NETWORKS.custom, ...customNetworkConfig }
      : NETWORKS[networkId];

    if (network.id !== currentNetwork.id) {
      setPendingNetwork(network);
      setShowConfirmDialog(true);
    }
  };

  const confirmNetworkSwitch = () => {
    if (pendingNetwork) {
      setCurrentNetwork(pendingNetwork);
      onNetworkChange?.(pendingNetwork);
      setShowConfirmDialog(false);
      setPendingNetwork(null);
    }
  };

  const cancelNetworkSwitch = () => {
    setShowConfirmDialog(false);
    setPendingNetwork(null);
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case "connected":
        return <CheckCircle2 className="size-4 text-green-600" />;
      case "disconnected":
        return <XCircle className="size-4 text-red-600" />;
      case "checking":
        return <AlertCircle className="size-4 text-yellow-600 animate-pulse" />;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Connected";
      case "disconnected":
        return "Disconnected";
      case "checking":
        return "Checking...";
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
              <Globe className="size-4" />
              <Badge className={currentNetwork.badgeClassName}>
                {currentNetwork.name}
              </Badge>
              <ChevronDown className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Select Network</span>
              <div className="flex items-center gap-1.5 text-xs font-normal">
                {getStatusIcon()}
                <span className={
                  connectionStatus === "connected" ? "text-green-600" :
                  connectionStatus === "disconnected" ? "text-red-600" :
                  "text-yellow-600"
                }>
                  {getStatusText()}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {Object.values(NETWORKS).map((network) => (
              <DropdownMenuItem
                key={network.id}
                onClick={() => handleNetworkSelect(network.id)}
                className="flex flex-col items-start gap-1.5 py-3"
              >
                <div className="flex items-center gap-2 w-full">
                  <Badge className={network.badgeClassName}>
                    {network.name}
                  </Badge>
                  {currentNetwork.id === network.id && (
                    <CheckCircle2 className="size-4 ml-auto text-green-600" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  <div className="truncate">{network.horizonUrl}</div>
                </div>
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            
            <div className="px-2 py-2">
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="font-medium">Current Network Details:</div>
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span>Horizon URL:</span>
                  </div>
                  <div className="text-xs break-all bg-muted px-2 py-1 rounded">
                    {currentNetwork.horizonUrl}
                  </div>
                  <div className="flex justify-between mt-2">
                    <span>Network Passphrase:</span>
                  </div>
                  <div className="text-xs break-all bg-muted px-2 py-1 rounded">
                    {currentNetwork.networkPassphrase}
                  </div>
                </div>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch Network?</DialogTitle>
            <DialogDescription>
              You are about to switch from{" "}
              <Badge className={currentNetwork.badgeClassName}>
                {currentNetwork.name}
              </Badge>{" "}
              to{" "}
              <Badge className={pendingNetwork?.badgeClassName}>
                {pendingNetwork?.name}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <AlertCircle className="size-4" />
              <AlertDescription>
                Switching networks will change the Horizon endpoint and network passphrase.
                Any pending transactions may be invalidated.
              </AlertDescription>
            </Alert>

            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium mb-1">New Network Details:</div>
                <div className="space-y-2 bg-muted p-3 rounded-lg">
                  <div>
                    <div className="text-xs text-muted-foreground">Horizon URL</div>
                    <div className="font-mono text-xs break-all">{pendingNetwork?.horizonUrl}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Network Passphrase</div>
                    <div className="font-mono text-xs break-all">{pendingNetwork?.networkPassphrase}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelNetworkSwitch}>
              Cancel
            </Button>
            <Button onClick={confirmNetworkSwitch}>
              Confirm Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <XCircle className="size-4" />
          <AlertDescription>
            Connection Error: {error}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
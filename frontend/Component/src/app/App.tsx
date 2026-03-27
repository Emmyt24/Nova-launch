import { NetworkSelector, NetworkConfig } from "./components/NetworkSelector";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";

export default function App() {
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkConfig | null>(null);

  const handleNetworkChange = (network: NetworkConfig) => {
    setSelectedNetwork(network);
    console.log("Network switched to:", network);
  };

  return (
    <div className="size-full flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">Stellar Network Selector</h1>
          <p className="text-muted-foreground">
            Select and switch between Stellar networks with ease
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Network Configuration</CardTitle>
            <CardDescription>
              Choose your Stellar network and monitor connection status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <div className="text-sm font-medium">Active Network</div>
                <div className="text-xs text-muted-foreground">
                  Select a network from the dropdown
                </div>
              </div>
              <NetworkSelector onNetworkChange={handleNetworkChange} />
            </div>

            {selectedNetwork && (
              <div className="border-t pt-6 space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-3">Current Network Information</h3>
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <span className="text-sm text-muted-foreground">Network</span>
                      <Badge className={selectedNetwork.badgeClassName}>
                        {selectedNetwork.name}
                      </Badge>
                    </div>
                    <div className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="text-sm text-muted-foreground">Horizon URL</div>
                      <div className="text-sm font-mono break-all">
                        {selectedNetwork.horizonUrl}
                      </div>
                    </div>
                    <div className="p-3 bg-muted rounded-lg space-y-2">
                      <div className="text-sm text-muted-foreground">Network Passphrase</div>
                      <div className="text-sm font-mono break-all">
                        {selectedNetwork.networkPassphrase}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <div className="text-sm">
                    <div className="font-medium text-blue-900 mb-1">Network Selection Persisted</div>
                    <div className="text-blue-700 text-xs">
                      Your network selection is saved locally and will persist across sessions.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span><strong>Network Switching:</strong> Easily switch between Testnet, Mainnet, and Custom networks</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span><strong>Confirmation Modal:</strong> Prevents accidental network switches with a confirmation dialog</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span><strong>Status Indicator:</strong> Real-time connection status monitoring with auto-refresh</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span><strong>Network Details:</strong> View Horizon URL and network passphrase for each network</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span><strong>Error Handling:</strong> Graceful error handling with user-friendly messages</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span><strong>Persistence:</strong> Network selection saved to localStorage</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span><strong>Color Coding:</strong> Testnet (Yellow), Mainnet (Green), Custom (Blue)</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
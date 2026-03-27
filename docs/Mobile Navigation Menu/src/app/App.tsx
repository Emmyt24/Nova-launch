import * as React from "react";
import { Header } from "./components/header";
import { Button } from "./components/ui/button";
import { Coins, Rocket, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  const [isWalletConnected, setIsWalletConnected] = React.useState(false);
  const [userAddress, setUserAddress] = React.useState<string>("");

  const handleConnectWallet = () => {
    // Simulate wallet connection
    setIsWalletConnected(true);
    setUserAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb");
    toast.success("Wallet connected successfully!");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        isWalletConnected={isWalletConnected}
        onConnectWallet={handleConnectWallet}
        userAddress={userAddress}
      />

      <main className="flex-1">
        {/* Hero Section */}
        <section id="home" className="container px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Create Your Token in Minutes
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Deploy secure, customizable tokens on the blockchain with just a few clicks.
              No coding required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={handleConnectWallet}>
                <Rocket className="size-5" />
                Get Started
              </Button>
              <Button size="lg" variant="outline">
                Learn More
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="container px-4 sm:px-6 lg:px-8 py-16 bg-accent/30">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Why Choose TokenForge?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <FeatureCard
              icon={<Zap className="size-8" />}
              title="Lightning Fast"
              description="Deploy your token in minutes, not hours. Our streamlined process gets you up and running quickly."
            />
            <FeatureCard
              icon={<Shield className="size-8" />}
              title="Secure & Audited"
              description="Battle-tested smart contracts that have been audited by leading security firms."
            />
            <FeatureCard
              icon={<Coins className="size-8" />}
              title="Fully Customizable"
              description="Customize every aspect of your token including supply, name, symbol, and more."
            />
          </div>
        </section>

        {/* Deploy Section */}
        <section id="deploy" className="container px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to Deploy?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Connect your wallet to get started with token deployment.
            </p>
            {!isWalletConnected ? (
              <Button size="lg" onClick={handleConnectWallet}>
                Connect Wallet
              </Button>
            ) : (
              <div className="p-8 rounded-lg border bg-card">
                <p className="text-muted-foreground mb-4">Wallet Connected</p>
                <p className="font-mono text-sm mb-6">{userAddress}</p>
                <Button size="lg">
                  <Coins className="size-5" />
                  Deploy New Token
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* My Tokens Section */}
        <section id="tokens" className="container px-4 sm:px-6 lg:px-8 py-16 bg-accent/30">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              My Tokens
            </h2>
            <div className="text-center text-muted-foreground">
              {isWalletConnected ? (
                <p>No tokens deployed yet. Start by deploying your first token!</p>
              ) : (
                <p>Connect your wallet to view your tokens.</p>
              )}
            </div>
          </div>
        </section>

        {/* Documentation Section */}
        <section id="docs" className="container px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              Documentation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DocCard
                title="Getting Started"
                description="Learn the basics of creating and deploying your first token."
              />
              <DocCard
                title="Token Customization"
                description="Explore all the customization options available for your tokens."
              />
              <DocCard
                title="Smart Contracts"
                description="Understand the smart contracts powering your tokens."
              />
              <DocCard
                title="API Reference"
                description="Complete API documentation for advanced integrations."
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>&copy; 2026 TokenForge. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex flex-col items-center text-center p-6 rounded-lg border bg-card hover:shadow-lg transition-shadow">
      <div className="mb-4 text-primary">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

interface DocCardProps {
  title: string;
  description: string;
}

function DocCard({ title, description }: DocCardProps) {
  return (
    <a
      href="#"
      className="p-6 rounded-lg border bg-card hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </a>
  );
}

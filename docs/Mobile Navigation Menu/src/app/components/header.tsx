import * as React from "react";
import { Home, Coins, FileText, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { MobileNav, HamburgerButton, type NavItem } from "./mobile-nav";

interface HeaderProps {
  isWalletConnected?: boolean;
  onConnectWallet?: () => void;
  userAddress?: string;
}

const navItems: NavItem[] = [
  { label: "Home", href: "#home", icon: <Home className="size-4" /> },
  { label: "Deploy Token", href: "#deploy", icon: <Coins className="size-4" /> },
  { label: "My Tokens", href: "#tokens", icon: <Wallet className="size-4" /> },
  { label: "Documentation", href: "#docs", icon: <FileText className="size-4" /> },
];

export function Header({ isWalletConnected = false, onConnectWallet, userAddress }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <a href="#home" className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Coins className="size-5" />
            </div>
            <span className="font-semibold text-lg hidden sm:inline-block">TokenForge</span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" role="navigation" aria-label="Main navigation">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-md hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.icon}
                {item.label}
              </a>
            ))}
          </nav>

          {/* Desktop Wallet Button */}
          <div className="hidden md:flex items-center gap-2">
            {isWalletConnected && userAddress ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent">
                <div className="size-2 rounded-full bg-green-500" />
                <span className="text-sm font-mono">
                  {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
                </span>
              </div>
            ) : (
              <Button onClick={onConnectWallet} variant="default">
                <Wallet className="size-4" />
                Connect Wallet
              </Button>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex md:hidden">
            <HamburgerButton
              isOpen={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            />
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <MobileNav
        isOpen={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        items={navItems}
        isWalletConnected={isWalletConnected}
        onConnectWallet={onConnectWallet}
        userAddress={userAddress}
      />
    </>
  );
}

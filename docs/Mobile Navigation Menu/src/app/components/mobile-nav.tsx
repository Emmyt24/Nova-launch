import * as React from "react";
import { Menu, X, Home, Coins, FileText, Wallet, User } from "lucide-react";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface MobileNavProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  items?: NavItem[];
  isWalletConnected?: boolean;
  onConnectWallet?: () => void;
  userAddress?: string;
}

const defaultNavItems: NavItem[] = [
  { label: "Home", href: "#home", icon: <Home className="size-5" /> },
  { label: "Deploy Token", href: "#deploy", icon: <Coins className="size-5" /> },
  { label: "My Tokens", href: "#tokens", icon: <Wallet className="size-5" /> },
  { label: "Documentation", href: "#docs", icon: <FileText className="size-5" /> },
];

export function MobileNav({
  isOpen,
  onOpenChange,
  items = defaultNavItems,
  isWalletConnected = false,
  onConnectWallet,
  userAddress,
}: MobileNavProps) {
  const handleNavItemClick = (href: string) => {
    // Close the menu when a nav item is clicked
    onOpenChange(false);
    
    // Navigate to the href (in a real app, you'd use router)
    if (href.startsWith("#")) {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[300px] sm:w-[350px]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        
        <nav className="flex flex-col gap-1 mt-8" role="navigation" aria-label="Mobile navigation">
          {items.map((item, index) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                handleNavItemClick(item.href);
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-md transition-colors hover:bg-accent focus:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                animation: `slideInFromRight 0.3s ease-out ${index * 0.05}s both`,
              }}
            >
              {item.icon && (
                <span className="text-muted-foreground">{item.icon}</span>
              )}
              <span className="text-base">{item.label}</span>
            </a>
          ))}

          <div className="border-t my-4" />

          {isWalletConnected && userAddress ? (
            <div className="px-4 py-3 rounded-md bg-accent/50">
              <div className="flex items-center gap-3">
                <User className="size-5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Connected</span>
                  <span className="text-sm font-mono">
                    {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => {
                onConnectWallet?.();
                onOpenChange(false);
              }}
              className="w-full"
              variant="default"
            >
              <Wallet className="size-4" />
              Connect Wallet
            </Button>
          )}
        </nav>
      </SheetContent>

      <style>{`
        @keyframes slideInFromRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </Sheet>
  );
}

interface HamburgerButtonProps {
  isOpen: boolean;
  onClick: () => void;
  className?: string;
}

export function HamburgerButton({ isOpen, onClick, className }: HamburgerButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={className}
      aria-label={isOpen ? "Close menu" : "Open menu"}
      aria-expanded={isOpen}
      aria-controls="mobile-navigation"
    >
      <div className="relative size-6">
        <span
          className={`absolute left-0 top-1 block h-0.5 w-6 bg-current transition-all duration-300 ${
            isOpen ? "rotate-45 top-2.5" : ""
          }`}
        />
        <span
          className={`absolute left-0 top-2.5 block h-0.5 w-6 bg-current transition-all duration-300 ${
            isOpen ? "opacity-0" : ""
          }`}
        />
        <span
          className={`absolute left-0 top-4 block h-0.5 w-6 bg-current transition-all duration-300 ${
            isOpen ? "-rotate-45 top-2.5" : ""
          }`}
        />
      </div>
      <span className="sr-only">{isOpen ? "Close menu" : "Open menu"}</span>
    </Button>
  );
}

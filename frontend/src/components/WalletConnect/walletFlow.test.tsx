import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConnectButton } from "./ConnectButton";

describe("Wallet Integration Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup initial mock state for Freighter
    const win = window as unknown as Record<string, unknown>;
    win.freighter = {
      requestPublicKey: vi.fn(),
      getNetwork: vi.fn(),
      // Adding listeners to test Account/Network changes
      watchAccount: vi.fn(),
      watchNetwork: vi.fn(),
    };
  });

  it("handles account changes during an active session", async () => {
    const win = window as unknown as Record<string, any>;
    let accountChangeHandler: (pubKey: string) => void = () => {};

    // Mock watchAccount to capture the callback function
    win.freighter.watchAccount.mockImplementation((callback: any) => {
      accountChangeHandler = callback;
    });

    render(<ConnectButton />);

    // Simulate internal state change via the captured callback
    await waitFor(() => accountChangeHandler("GNEW_ACCOUNT_777"));

    // Verify the UI reflects the new account (assuming it displays the address)
    // Adjust based on how your UI truncates/shows the key
    expect(screen.getByText(/GNEW/i)).toBeInTheDocument();
  });

  it("handles network changes (e.g., moving from Public to Testnet)", async () => {
    const win = window as unknown as Record<string, any>;
    let networkChangeHandler: (network: string) => void = () => {};

    win.freighter.watchNetwork.mockImplementation((callback: any) => {
      networkChangeHandler = callback;
    });

    render(<ConnectButton />);

    // Simulate switching network to TESTNET
    await waitFor(() => networkChangeHandler("TESTNET"));

    // If your component shows a warning or label for Testnet, assert it here
    // expect(screen.getByText(/Testnet/i)).toBeInTheDocument();
  });
});
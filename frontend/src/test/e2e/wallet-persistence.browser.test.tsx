import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TokenDeployForm } from '../../components/TokenDeployForm/TokenDeployForm';
import { useWallet } from '../../hooks/useWallet';
import { WalletService } from '../../services/wallet';
import { useTokenDeploy } from '../../hooks/useTokenDeploy';
import { useFactoryFees } from '../../hooks/useFactoryFees';
import { useFactoryState } from '../../hooks/useFactoryState';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../services/wallet', () => ({
    WalletService: {
        isInstalled: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        getPublicKey: vi.fn(),
        getNetwork: vi.fn(),
        getBalance: vi.fn(),
        signTransaction: vi.fn(),
        watchChanges: vi.fn(),
    }
}));

vi.mock('../../hooks/useTokenDeploy');
vi.mock('../../hooks/useFactoryFees');
vi.mock('../../hooks/useFactoryState');
vi.mock('../../services/analytics', () => ({
    analytics: { track: vi.fn() },
    AnalyticsEvent: {
        WALLET_DISCONNECTED: 'wallet_disconnected',
        WALLET_CONNECTED: 'wallet_connected',
        NETWORK_SWITCHED: 'network_switched'
    }
}));

// ── Test Harness ─────────────────────────────────────────────────────────────

function TestAppHarness() {
    const walletState = useWallet();
    return (
        <TokenDeployForm
            wallet={walletState.wallet}
            onConnectWallet={walletState.connect}
            isConnectingWallet={walletState.isConnecting}
        />
    );
}

// ── Setup ────────────────────────────────────────────────────────────────────

const MOCK_ADDRESS_1 = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const MOCK_ADDRESS_2 = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Default mock returns for hooks so component renders without errors
    vi.mocked(useFactoryFees).mockReturnValue({
        baseFee: 7,
        metadataFee: 3,
        loading: false,
        error: null,
        isFallback: false,
        refresh: vi.fn(),
    });
    vi.mocked(useFactoryState).mockReturnValue({
        isPaused: false,
        loading: false,
        error: null,
        lastChecked: null,
        refresh: vi.fn(),
    });
    vi.mocked(useTokenDeploy).mockReturnValue({
        deploy: vi.fn(),
        retry: vi.fn(),
        reset: vi.fn(),
        status: 'idle',
        statusMessage: '',
        isDeploying: false,
        error: null,
        retryCount: 0,
        canRetry: false,
    });
});

afterEach(() => {
    localStorage.clear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Wallet Session Persistence', () => {
    it('restores session automatically when nova_wallet_connected=true is in localStorage', async () => {
        localStorage.setItem('nova_wallet_connected', 'true');

        vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
        vi.mocked(WalletService.getPublicKey).mockResolvedValue(MOCK_ADDRESS_1);
        vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
        vi.mocked(WalletService.watchChanges).mockReturnValue(() => {});

        render(<TestAppHarness />);

        // Give the async effect time to resolve and update state
        await waitFor(() => {
            // If connected, it pre-fills the admin wallet with the connected address
            expect(screen.getByPlaceholderText(/GXXX/i)).toHaveValue(MOCK_ADDRESS_1);
        });
        
        expect(WalletService.isInstalled).toHaveBeenCalledTimes(1);
        expect(WalletService.getPublicKey).toHaveBeenCalledTimes(1);
    });

    it('does not restore session if nova_wallet_connected is missing', async () => {
        vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
        vi.mocked(WalletService.getPublicKey).mockResolvedValue(MOCK_ADDRESS_1);

        render(<TestAppHarness />);

        await waitFor(() => {
            // The input should be empty because it didn't auto-connect
            expect(screen.getByPlaceholderText(/GXXX/i)).toHaveValue('');
        });

        // Effect check should not have occurred if localStorage key is missing
        expect(WalletService.getPublicKey).not.toHaveBeenCalled();
    });

    it('clears session and gracefully recovers if localStorage is true but wallet not installed', async () => {
        localStorage.setItem('nova_wallet_connected', 'true');
        vi.mocked(WalletService.isInstalled).mockResolvedValue(false);

        render(<TestAppHarness />);

        await waitFor(() => {
            expect(localStorage.getItem('nova_wallet_connected')).toBeNull();
        });
        expect(WalletService.getPublicKey).not.toHaveBeenCalled();
    });
});

describe('Wallet Disconnect & Account Change Mid-Flow', () => {
    it('disables deployment and requires correct admin wallet when address changes mid-flow', async () => {
        let triggerWalletChange: (params: { address: string | null; network: string }) => void = () => {};
        
        vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
        vi.mocked(WalletService.getPublicKey).mockResolvedValue(MOCK_ADDRESS_1);
        vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
        vi.mocked(WalletService.watchChanges).mockImplementation((callback) => {
            triggerWalletChange = callback;
            return () => {};
        });

        localStorage.setItem('nova_wallet_connected', 'true');
        render(<TestAppHarness />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/GXXX/i)).toHaveValue(MOCK_ADDRESS_1);
        });

        // Fill out basic info
        fireEvent.change(screen.getByPlaceholderText(/My Awesome Token/i), { target: { value: 'My Token' } });
        fireEvent.change(screen.getByPlaceholderText(/MAT/i), { target: { value: 'MTK' } });
        fireEvent.change(screen.getByPlaceholderText(/1000000/i), { target: { value: '1000000' } });
        // Proceed to review step
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
        
        await waitFor(() => {
            expect(screen.getByText('Review & Deploy')).toBeInTheDocument();
        });

        // Now simulate a wallet account change
        act(() => {
            triggerWalletChange({ address: MOCK_ADDRESS_2, network: 'testnet' });
        });

        // The form should detect the mismatch
        fireEvent.click(screen.getByRole('button', { name: /Deploy Token/i }));
        await waitFor(() => {
            expect(screen.getByText('Admin wallet must match the connected wallet address.')).toBeInTheDocument();
        });
    });

    it('disables deployment when wallet disconnects mid-flow', async () => {
        let triggerWalletChange: (params: { address: string | null; network: string }) => void = () => {};
        
        vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
        vi.mocked(WalletService.getPublicKey).mockResolvedValue(MOCK_ADDRESS_1);
        vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
        vi.mocked(WalletService.watchChanges).mockImplementation((callback) => {
            triggerWalletChange = callback;
            return () => {};
        });

        localStorage.setItem('nova_wallet_connected', 'true');
        render(<TestAppHarness />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/GXXX/i)).toHaveValue(MOCK_ADDRESS_1);
        });

        // Fill out basic info and proceed to review
        fireEvent.change(screen.getByPlaceholderText(/My Awesome Token/i), { target: { value: 'My Token' } });
        fireEvent.change(screen.getByPlaceholderText(/MAT/i), { target: { value: 'MTK' } });
        fireEvent.change(screen.getByPlaceholderText(/1000000/i), { target: { value: '1000000' } });
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
        
        await waitFor(() => {
            expect(screen.getByText('Review & Deploy')).toBeInTheDocument();
        });

        // Simulate disconnect (e.g. user locked freighter)
        act(() => {
            triggerWalletChange({ address: null, network: 'testnet' });
        });

        await waitFor(() => {
            expect(screen.getByText('Connect your wallet to continue deployment.')).toBeInTheDocument();
            // Button is disabled or missing
            expect(screen.getByRole('button', { name: /Deploy Token/i })).toBeDisabled();
        });

        expect(localStorage.getItem('nova_wallet_connected')).toBeNull();
    });
});

describe('Network Switch Mid-Flow', () => {
    it('updates wallet state and network display when user switches network in Freighter', async () => {
        let triggerWalletChange: (params: { address: string | null; network: string }) => void = () => {};
        
        vi.mocked(WalletService.isInstalled).mockResolvedValue(true);
        vi.mocked(WalletService.getPublicKey).mockResolvedValue(MOCK_ADDRESS_1);
        vi.mocked(WalletService.getNetwork).mockResolvedValue('testnet');
        vi.mocked(WalletService.watchChanges).mockImplementation((callback) => {
            triggerWalletChange = callback;
            return () => {};
        });

        localStorage.setItem('nova_wallet_connected', 'true');
        render(<TestAppHarness />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/GXXX/i)).toHaveValue(MOCK_ADDRESS_1);
        });

        // Proceed to review
        fireEvent.change(screen.getByPlaceholderText(/My Awesome Token/i), { target: { value: 'My Token' } });
        fireEvent.change(screen.getByPlaceholderText(/MAT/i), { target: { value: 'MTK' } });
        fireEvent.change(screen.getByPlaceholderText(/1000000/i), { target: { value: '1000000' } });
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
        
        await waitFor(() => {
            expect(screen.getByText(/testnet/i)).toBeInTheDocument();
        });

        // Simulate network switch
        act(() => {
            triggerWalletChange({ address: MOCK_ADDRESS_1, network: 'public' });
        });

        await waitFor(() => {
            expect(screen.getByText(/mainnet/i)).toBeInTheDocument();
        });
    });
});

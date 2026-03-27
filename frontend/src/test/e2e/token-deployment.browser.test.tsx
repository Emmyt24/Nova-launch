import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TokenDeployForm } from '../../components/TokenDeployForm/TokenDeployForm'
import type { WalletState } from '../../types'

vi.mock('../../hooks/useTokenDeploy')
vi.mock('../../hooks/useFactoryFees')
vi.mock('../../hooks/useFactoryState')
vi.mock('../../services/analytics', () => ({ analytics: { track: vi.fn() }, AnalyticsEvent: {} }))

import { useTokenDeploy } from '../../hooks/useTokenDeploy'
import { useFactoryFees } from '../../hooks/useFactoryFees'
import { useFactoryState } from '../../hooks/useFactoryState'

const MOCK_ADDRESS = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

const connectedWallet: WalletState = {
    connected: true,
    address: MOCK_ADDRESS,
    network: 'testnet',
}

const disconnectedWallet: WalletState = {
    connected: false,
    address: null,
    network: 'testnet',
}

function renderForm(wallet: WalletState = connectedWallet) {
    render(
        <TokenDeployForm
            wallet={wallet}
            onConnectWallet={vi.fn().mockResolvedValue(undefined)}
            isConnectingWallet={false}
        />
    )
}

function fillBasicInfo(adminWallet = MOCK_ADDRESS) {
    fireEvent.change(screen.getByPlaceholderText(/My Awesome Token/i), { target: { value: 'My Token' } })
    fireEvent.change(screen.getByPlaceholderText(/MAT/i), { target: { value: 'MTK' } })
    fireEvent.change(screen.getByPlaceholderText(/1000000/i), { target: { value: '1000000' } })
    fireEvent.change(screen.getByPlaceholderText(/GXXX/i), { target: { value: adminWallet } })
}

beforeEach(() => {
    vi.mocked(useFactoryFees).mockReturnValue({
        baseFee: 7,
        metadataFee: 3,
        loading: false,
        error: null,
        isFallback: false,
        refresh: vi.fn(),
    })
    vi.mocked(useFactoryState).mockReturnValue({
        isPaused: false,
        loading: false,
        error: null,
        lastChecked: null,
        refresh: vi.fn(),
    })
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
    })
})

// ---------------------------------------------------------------------------
// 1. Wallet not connected
// ---------------------------------------------------------------------------

describe('Wallet not connected', () => {
    it('shows connect wallet message on review step', async () => {
        renderForm(disconnectedWallet)
        fillBasicInfo('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ')
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByText('Connect your wallet to continue deployment.')).toBeInTheDocument()
        })
    })

    it('deploy button is disabled on review step when wallet not connected', async () => {
        renderForm(disconnectedWallet)
        fillBasicInfo('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ')
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Deploy Token/i })).toBeDisabled()
        })
    })
})

// ---------------------------------------------------------------------------
// 2. Basic info form validation
// ---------------------------------------------------------------------------

describe('Basic info form validation', () => {
    it('shows token name error when Next Step clicked with empty form', async () => {
        renderForm()
        // Submit the form directly to bypass the disabled button
        const form = document.querySelector('form')!
        fireEvent.submit(form)
        await waitFor(() => {
            expect(screen.getByText(/Token name must be/i)).toBeInTheDocument()
        })
    })

    it('shows symbol error on blur with invalid symbol (special chars)', async () => {
        renderForm()
        const symbolInput = screen.getByPlaceholderText(/MAT/i)
        // Use special chars that can't be uppercased and fail the [A-Z0-9]+ regex
        fireEvent.change(symbolInput, { target: { value: 'MT-K' } })
        fireEvent.blur(symbolInput)
        await waitFor(() => {
            expect(screen.getByText(/Token symbol must be/i)).toBeInTheDocument()
        })
    })

    it('shows invalid address error on blur with bad address', async () => {
        renderForm()
        const adminInput = screen.getByPlaceholderText(/GXXX/i)
        fireEvent.change(adminInput, { target: { value: 'not-a-valid-address' } })
        fireEvent.blur(adminInput)
        await waitFor(() => {
            expect(screen.getByText(/Invalid Stellar address/i)).toBeInTheDocument()
        })
    })

    it('advances to review step with valid form data', async () => {
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByText('Review & Deploy')).toBeInTheDocument()
        })
    })
})

// ---------------------------------------------------------------------------
// 3. Fee display
// ---------------------------------------------------------------------------

describe('Fee display', () => {
    it('shows animate-pulse elements when fees are loading', async () => {
        vi.mocked(useFactoryFees).mockReturnValue({
            baseFee: 7,
            metadataFee: 3,
            loading: true,
            error: null,
            isFallback: false,
            refresh: vi.fn(),
        })
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByText('Review & Deploy')).toBeInTheDocument()
        })
        const pulseElements = document.querySelectorAll('.animate-pulse')
        expect(pulseElements.length).toBeGreaterThan(0)
    })

    it('shows "Using estimated fees" when isFallback=true and error set', async () => {
        vi.mocked(useFactoryFees).mockReturnValue({
            baseFee: 7,
            metadataFee: 3,
            loading: false,
            error: 'Contract read failed',
            isFallback: true,
            refresh: vi.fn(),
        })
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByText(/Using estimated fees/i)).toBeInTheDocument()
        })
    })
})

// ---------------------------------------------------------------------------
// 4. Deployment submission
// ---------------------------------------------------------------------------

describe('Deployment submission', () => {
    it('calls deploy with correct params when Deploy Token is clicked', async () => {
        const mockDeploy = vi.fn().mockResolvedValue({
            tokenAddress: 'GTOKEN',
            transactionHash: 'TXHASH',
            totalFee: '7',
            timestamp: Date.now(),
        })
        vi.mocked(useTokenDeploy).mockReturnValue({
            deploy: mockDeploy,
            retry: vi.fn(),
            reset: vi.fn(),
            status: 'idle',
            statusMessage: '',
            isDeploying: false,
            error: null,
            retryCount: 0,
            canRetry: false,
        })
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => screen.getByText('Review & Deploy'))
        fireEvent.click(screen.getByRole('button', { name: /Deploy Token/i }))
        await waitFor(() => {
            expect(mockDeploy).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'My Token',
                    symbol: 'MTK',
                    initialSupply: '1000000',
                    adminWallet: MOCK_ADDRESS,
                })
            )
        })
    })

    it('shows "Uploading metadata to IPFS..." when status=uploading and isDeploying=true', async () => {
        vi.mocked(useTokenDeploy).mockReturnValue({
            deploy: vi.fn(),
            retry: vi.fn(),
            reset: vi.fn(),
            status: 'uploading',
            statusMessage: 'Uploading metadata to IPFS...',
            isDeploying: true,
            error: null,
            retryCount: 0,
            canRetry: false,
        })
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByText('Uploading metadata to IPFS...')).toBeInTheDocument()
        })
    })

    it('shows "Building transaction" when status=deploying and isDeploying=true', async () => {
        vi.mocked(useTokenDeploy).mockReturnValue({
            deploy: vi.fn(),
            retry: vi.fn(),
            reset: vi.fn(),
            status: 'deploying',
            statusMessage: 'Building transaction, requesting signature, and submitting to Stellar...',
            isDeploying: true,
            error: null,
            retryCount: 0,
            canRetry: false,
        })
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByText(/Building transaction/i)).toBeInTheDocument()
        })
    })
})

// ---------------------------------------------------------------------------
// 5. Error handling
// ---------------------------------------------------------------------------

describe('Error handling', () => {
    it('shows "Deployment Failed" and error message when status=error', async () => {
        vi.mocked(useTokenDeploy).mockReturnValue({
            deploy: vi.fn(),
            retry: vi.fn(),
            reset: vi.fn(),
            status: 'error',
            statusMessage: 'Deployment failed.',
            isDeploying: false,
            error: { code: 'TRANSACTION_FAILED', message: 'Transaction was rejected' },
            retryCount: 1,
            canRetry: true,
        })
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByText('Deployment Failed')).toBeInTheDocument()
            expect(screen.getByText('Transaction was rejected')).toBeInTheDocument()
        })
    })

    it('shows "Retry Deployment" button when status=error', async () => {
        vi.mocked(useTokenDeploy).mockReturnValue({
            deploy: vi.fn(),
            retry: vi.fn(),
            reset: vi.fn(),
            status: 'error',
            statusMessage: 'Deployment failed.',
            isDeploying: false,
            error: { code: 'TRANSACTION_FAILED', message: 'Something went wrong' },
            retryCount: 1,
            canRetry: true,
        })
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Retry Deployment/i })).toBeInTheDocument()
        })
    })

    it('shows admin wallet mismatch error when admin address differs from connected wallet', async () => {
        // A valid 56-char Stellar address (G + 55 chars from A-Z2-7) different from MOCK_ADDRESS
        const differentAddress = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ'
        renderForm()
        fillBasicInfo(differentAddress)
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => screen.getByText('Review & Deploy'))
        fireEvent.click(screen.getByRole('button', { name: /Deploy Token/i }))
        await waitFor(() => {
            expect(screen.getByText('Admin wallet must match the connected wallet address.')).toBeInTheDocument()
        })
    })
})

// ---------------------------------------------------------------------------
// 6. Protocol paused
// ---------------------------------------------------------------------------

describe('Protocol paused', () => {
    beforeEach(() => {
        vi.mocked(useFactoryState).mockReturnValue({
            isPaused: true,
            loading: false,
            error: null,
            lastChecked: null,
            refresh: vi.fn(),
        })
    })

    it('shows "Protocol Maintenance" heading on review step when paused', async () => {
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            expect(screen.getByText('Protocol Maintenance')).toBeInTheDocument()
        })
    })

    it('deploy button shows "Protocol Paused" and is disabled when paused', async () => {
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => {
            const btn = screen.getByRole('button', { name: /Protocol Paused/i })
            expect(btn).toBeInTheDocument()
            expect(btn).toBeDisabled()
        })
    })
})

// ---------------------------------------------------------------------------
// 7. Navigation
// ---------------------------------------------------------------------------

describe('Navigation', () => {
    it('Back button on review step returns to basic info', async () => {
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => screen.getByText('Review & Deploy'))
        fireEvent.click(screen.getByRole('button', { name: /Back/i }))
        await waitFor(() => {
            expect(screen.getByPlaceholderText(/My Awesome Token/i)).toBeInTheDocument()
        })
    })

    it('form data is preserved when navigating back', async () => {
        renderForm()
        fillBasicInfo()
        fireEvent.click(screen.getByRole('button', { name: /Next Step/i }))
        await waitFor(() => screen.getByText('Review & Deploy'))
        fireEvent.click(screen.getByRole('button', { name: /Back/i }))
        await waitFor(() => {
            expect((screen.getByPlaceholderText(/My Awesome Token/i) as HTMLInputElement).value).toBe('My Token')
        })
    })
})

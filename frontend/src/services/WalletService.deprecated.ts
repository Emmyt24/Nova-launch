/**
 * @deprecated This file is deprecated. Use WalletService from './wallet.ts' instead.
 * 
 * This duplicate implementation has been consolidated into the canonical wallet.ts service.
 * All wallet functionality (connect, disconnect, network detection, signing, balance checks)
 * is now available through the standardized WalletService class.
 * 
 * Migration:
 * - Replace: import { WalletService } from './WalletService'
 * - With: import { WalletService } from './wallet'
 * 
 * The canonical service provides:
 * - isInstalled(): Check if Freighter is installed
 * - connect(): Connect to wallet
 * - disconnect(): Disconnect wallet
 * - getPublicKey(): Get wallet address
 * - getNetwork(): Get current network
 * - getBalance(address): Get XLM balance
 * - signTransaction(xdr, networkPassphrase): Sign transactions
 * - watchChanges(callback): Watch for wallet/network changes
 */

// Re-export from canonical implementation for backward compatibility
export { WalletService } from './wallet';

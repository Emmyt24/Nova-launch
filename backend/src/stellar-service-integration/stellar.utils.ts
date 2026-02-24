import { StellarInvalidAddressException } from "./stellar.exceptions";

/**
 * Validates a Stellar account address (G... format).
 */
export function isValidStellarAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  // Stellar public keys are 56-character base32-encoded strings starting with 'G'
  return /^G[A-Z2-7]{55}$/.test(address);
}

/**
 * Validates a Stellar contract address (C... format).
 */
export function isValidContractAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  // Soroban contract IDs start with 'C' and are 56 characters
  return /^C[A-Z2-7]{55}$/.test(address);
}

/**
 * Validates either a Stellar account or contract address.
 */
export function isValidAddress(address: string): boolean {
  return isValidStellarAddress(address) || isValidContractAddress(address);
}

/**
 * Asserts that an address is valid, throwing if not.
 */
export function assertValidAddress(address: string): void {
  if (!isValidAddress(address)) {
    throw new StellarInvalidAddressException(address);
  }
}

/**
 * Truncates a Stellar address for display (e.g., GABCD...WXYZ).
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Converts stroops (1e-7 XLM) to XLM string.
 */
export function stroopsToXlm(stroops: string | number): string {
  const value = BigInt(stroops);
  const xlm = value / BigInt(10_000_000);
  const remainder = value % BigInt(10_000_000);
  return `${xlm}.${remainder.toString().padStart(7, "0")}`;
}

/**
 * Converts XLM to stroops.
 */
export function xlmToStroops(xlm: string): string {
  const [whole, fraction = "0"] = xlm.split(".");
  const paddedFraction = fraction.padEnd(7, "0").slice(0, 7);
  return (
    BigInt(whole) * BigInt(10_000_000) +
    BigInt(paddedFraction)
  ).toString();
}

/**
 * Formats a Soroban amount using token decimals.
 */
export function formatTokenAmount(
  amount: string | bigint,
  decimals: number
): string {
  const raw = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  return `${whole}.${remainder.toString().padStart(decimals, "0")}`;
}

/**
 * Sleep utility for retry/backoff logic.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay.
 */
export function calculateBackoff(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  factor: number
): number {
  const delay = initialDelay * Math.pow(factor, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Test helper utilities
 */

export const mockFile = (
    name: string = 'test.png',
    size: number = 1024,
    type: string = 'image/png'
): File => {
    const blob = new Blob(['x'.repeat(size)], { type });
    return new File([blob], name, { type });
};

export const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const mockWalletAddress = () =>
    'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

export const mockTransactionHash = () =>
    'a'.repeat(64);

export const mockTransactionHashWithPrefix = (prefix: string = 'a') =>
    prefix.repeat(64).slice(0, 64);

export const mockTokenAddress = () =>
    'CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

/**
 * Generate a transaction hash with a specific pattern
 */
export const generateTransactionHash = (seed: number = 0): string => {
    const chars = 'abcdef0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) {
        result += chars[(seed + i) % chars.length];
    }
    return result;
};

/**
 * Create multiple unique transaction hashes
 */
export const generateTransactionHashes = (count: number): string[] => {
    return Array.from({ length: count }, (_, i) =>
        generateTransactionHash(i)
    );
};

/**
 * Burn Token Integration Example
 * 
 * This example demonstrates how to use the burn functionality
 * in the Stellar Token Deployer application.
 */

import { StellarService } from './services/stellar';
import type { BurnTokenParams, BurnResult } from './types';

// Initialize the service
const stellarService = new StellarService('testnet');

/**
 * Example 1: Burn tokens from user's wallet
 */
async function burnTokensExample() {
  const params: BurnTokenParams = {
    tokenAddress: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    from: 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
    amount: '1000', // Amount in token units (will be converted to smallest unit)
  };

  try {
    const result: BurnResult = await stellarService.burnTokens(params);
    
    console.log('Burn successful!');
    console.log('Transaction Hash:', result.txHash);
    console.log('Burned Amount:', result.burnedAmount);
    console.log('New Balance:', result.newBalance);
    console.log('New Supply:', result.newSupply);
    
    return result;
  } catch (error: any) {
    console.error('Burn failed:', error.message);
    
    // Handle specific errors
    switch (error.code) {
      case 'INSUFFICIENT_BALANCE':
        console.error('You do not have enough tokens to burn');
        break;
      case 'INVALID_AMOUNT':
        console.error('Please enter a valid amount greater than zero');
        break;
      case 'UNAUTHORIZED':
        console.error('You are not authorized to burn these tokens');
        break;
      case 'WALLET_REJECTED':
        console.error('Transaction was rejected in your wallet');
        break;
      default:
        console.error('An unexpected error occurred');
    }
    
    throw error;
  }
}

/**
 * Example 2: Fetch burn history for a token
 */
async function getBurnHistoryExample() {
  const tokenAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  
  try {
    const history = await stellarService.getBurnHistory(tokenAddress);
    
    console.log(`Found ${history.length} burn events`);
    
    history.forEach((record) => {
      console.log('---');
      console.log('Timestamp:', new Date(record.timestamp).toLocaleString());
      console.log('From:', record.from);
      console.log('Amount:', record.amount);
      console.log('Admin Burn:', record.isAdminBurn);
      console.log('TX Hash:', record.txHash);
    });
    
    return history;
  } catch (error: any) {
    console.error('Failed to fetch burn history:', error.message);
    throw error;
  }
}

/**
 * Example 3: Burn with validation
 */
async function burnWithValidation(
  tokenAddress: string,
  from: string,
  amount: string
) {
  // Validate inputs
  if (!tokenAddress || !from || !amount) {
    throw new Error('All parameters are required');
  }
  
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  
  // Execute burn
  return await stellarService.burnTokens({
    tokenAddress,
    from,
    amount,
  });
}

export {
  burnTokensExample,
  getBurnHistoryExample,
  burnWithValidation,
};

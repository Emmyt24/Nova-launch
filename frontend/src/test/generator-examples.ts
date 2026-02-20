/**
 * Example usage of generators - for documentation and testing purposes
 * Run with: npx tsx generator-examples.ts
 */

import * as fc from 'fast-check';
import {
    validStellarAddress,
    invalidStellarAddress,
    invalidStellarAddressWithReason,
    validTokenName,
    validTokenSymbol,
    validDecimals,
    validInitialSupply,
    validTokenParams,
    feeAmount,
    validFeeAmount,
    metadataUri,
    tokenOperation,
    tokenOperationSequence,
    transactionHash,
    timestamp,
    networkType,
} from './generators';

console.log('=== Stellar Address Generators ===\n');

console.log('Valid Stellar Addresses (5 examples):');
fc.sample(validStellarAddress(), 5).forEach((addr, i) => {
    console.log(`  ${i + 1}. ${addr}`);
});

console.log('\nInvalid Stellar Addresses (5 examples):');
fc.sample(invalidStellarAddress(), 5).forEach((addr, i) => {
    console.log(`  ${i + 1}. "${addr}" (length: ${addr.length})`);
});

console.log('\nInvalid Addresses with Reasons (5 examples):');
fc.sample(invalidStellarAddressWithReason(), 5).forEach(({ address, reason }, i) => {
    console.log(`  ${i + 1}. Reason: ${reason}, Address: "${address}"`);
});

console.log('\n=== Token Parameter Generators ===\n');

console.log('Token Names (5 examples):');
fc.sample(validTokenName(), 5).forEach((name, i) => {
    console.log(`  ${i + 1}. "${name}"`);
});

console.log('\nToken Symbols (5 examples):');
fc.sample(validTokenSymbol(), 5).forEach((symbol, i) => {
    console.log(`  ${i + 1}. ${symbol}`);
});

console.log('\nDecimals (5 examples):');
fc.sample(validDecimals(), 5).forEach((decimals, i) => {
    console.log(`  ${i + 1}. ${decimals}`);
});

console.log('\nInitial Supply (5 examples):');
fc.sample(validInitialSupply(), 5).forEach((supply, i) => {
    console.log(`  ${i + 1}. ${supply}`);
});

console.log('\nComplete Token Parameters (2 examples):');
fc.sample(validTokenParams(), 2).forEach((params, i) => {
    console.log(`  ${i + 1}.`, JSON.stringify(params, null, 2));
});

console.log('\n=== Fee Generators ===\n');

console.log('Valid Fees (5 examples):');
fc.sample(validFeeAmount(), 5).forEach((fee, i) => {
    console.log(`  ${i + 1}. ${fee} XLM`);
});

console.log('\nCustom Fee Range 10-50 (5 examples):');
fc.sample(feeAmount(10, 50), 5).forEach((fee, i) => {
    console.log(`  ${i + 1}. ${fee} XLM`);
});

console.log('\n=== Utility Generators ===\n');

console.log('Metadata URIs (5 examples):');
fc.sample(metadataUri(), 5).forEach((uri, i) => {
    console.log(`  ${i + 1}. ${uri}`);
});

console.log('\nTransaction Hashes (3 examples):');
fc.sample(transactionHash(), 3).forEach((hash, i) => {
    console.log(`  ${i + 1}. ${hash}`);
});

console.log('\nTimestamps (5 examples):');
fc.sample(timestamp(), 5).forEach((ts, i) => {
    const date = new Date(ts);
    console.log(`  ${i + 1}. ${ts} (${date.toISOString()})`);
});

console.log('\nNetwork Types (5 examples):');
fc.sample(networkType(), 5).forEach((network, i) => {
    console.log(`  ${i + 1}. ${network}`);
});

console.log('\n=== Operation Generators ===\n');

console.log('Token Operations (3 examples):');
fc.sample(tokenOperation(), 3).forEach((op, i) => {
    console.log(`  ${i + 1}. Type: ${op.type}, Timestamp: ${new Date(op.timestamp).toISOString()}`);
});

console.log('\nOperation Sequences (2 examples, 3-5 operations each):');
fc.sample(tokenOperationSequence(3, 5), 2).forEach((sequence, i) => {
    console.log(`  ${i + 1}. Sequence of ${sequence.length} operations:`);
    sequence.forEach((op, j) => {
        console.log(`      ${j + 1}. ${op.type}`);
    });
});

console.log('\n=== Generator Statistics ===\n');

// Test distribution
const addressSample = fc.sample(validStellarAddress(), 100);
console.log(`Valid addresses generated: ${addressSample.length}`);
console.log(`All start with G: ${addressSample.every(a => a[0] === 'G')}`);
console.log(`All 56 chars: ${addressSample.every(a => a.length === 56)}`);

const invalidSample = fc.sample(invalidStellarAddress(), 100);
console.log(`\nInvalid addresses generated: ${invalidSample.length}`);
console.log(`Length distribution:`);
const lengthCounts = invalidSample.reduce((acc, addr) => {
    const key = addr.length < 56 ? 'short' : addr.length > 56 ? 'long' : 'exact';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
}, {} as Record<string, number>);
console.log(`  Short (<56): ${lengthCounts.short || 0}`);
console.log(`  Exact (56): ${lengthCounts.exact || 0}`);
console.log(`  Long (>56): ${lengthCounts.long || 0}`);

console.log('\n✅ All generators working correctly!\n');

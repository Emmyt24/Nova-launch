/**
 * Example usage of the FeeBreakdown component
 * This file demonstrates how to integrate FeeBreakdown into your application
 */

import { FeeBreakdown } from './FeeBreakdown';

// Example 1: Basic usage in a token deployment form
export function TokenDeploymentExample() {
    const baseFee = 1.5; // Base network fee
    const hasMetadata = true;
    const metadataFee = hasMetadata ? 0.5 : 0;

    return (
        <div className="max-w-md mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">Deploy Your Token</h2>
            
            {/* Your form fields here */}
            
            <FeeBreakdown 
                baseFee={baseFee} 
                metadataFee={metadataFee} 
            />
            
            <button className="mt-4 w-full bg-blue-500 text-white py-2 rounded">
                Deploy Token
            </button>
        </div>
    );
}

// Example 2: With USD conversion
export function TokenDeploymentWithUSDExample() {
    const baseFee = 10;
    const metadataFee = 5;
    const xlmToUsdRate = 0.12; // Fetch this from an API in real usage

    return (
        <div className="max-w-md mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">Deploy Your Token</h2>
            
            <FeeBreakdown 
                baseFee={baseFee} 
                metadataFee={metadataFee}
                currency="XLM"
                xlmToUsdRate={xlmToUsdRate}
            />
        </div>
    );
}

// Example 3: Dynamic fee calculation based on user input
export function DynamicFeeExample() {
    const baseFee = 1.5;
    const includeMetadata = true; // This could come from a checkbox
    const metadataFee = includeMetadata ? 0.5 : 0;

    return (
        <div className="max-w-md mx-auto p-4">
            <label className="flex items-center gap-2 mb-4">
                <input type="checkbox" checked={includeMetadata} readOnly />
                <span>Include metadata (image & description)</span>
            </label>
            
            <FeeBreakdown 
                baseFee={baseFee} 
                metadataFee={metadataFee}
                className="mb-4"
            />
            
            <p className="text-sm text-gray-600">
                {includeMetadata 
                    ? 'Metadata will be stored on IPFS for permanent access'
                    : 'No metadata will be stored'
                }
            </p>
        </div>
    );
}

// Example 4: Integration with a service that calculates fees
export function ServiceIntegrationExample() {
    // In real usage, this would come from your StellarService or similar
    const feeEstimate = {
        baseFee: 2.5,
        metadataFee: 0.75,
        xlmToUsdRate: 0.12,
    };

    return (
        <div className="max-w-md mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">Fee Estimate</h2>
            
            <FeeBreakdown 
                baseFee={feeEstimate.baseFee} 
                metadataFee={feeEstimate.metadataFee}
                currency="XLM"
                xlmToUsdRate={feeEstimate.xlmToUsdRate}
            />
            
            <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-800">
                <p>💡 Tip: Fees may vary based on network congestion</p>
            </div>
        </div>
    );
}

# FeeBreakdown Component

A component to display fee breakdown for token deployment with clear itemization and helpful tooltips.

## Features

- Itemized fee list with base fee and optional metadata fee
- Total fee calculation and display
- Currency conversion support (XLM/USD)
- Interactive tooltips with fee explanations
- Responsive design
- Accessible with proper ARIA labels
- Customizable styling

## Usage

```tsx
import { FeeBreakdown } from '@/components/FeeBreakdown';

// Basic usage with base fee only
<FeeBreakdown baseFee={1.5} />

// With metadata fee
<FeeBreakdown baseFee={1.5} metadataFee={0.5} />

// With USD conversion
<FeeBreakdown 
  baseFee={10} 
  metadataFee={5} 
  currency="XLM" 
  xlmToUsdRate={0.12} 
/>

// Display in USD
<FeeBreakdown 
  baseFee={10} 
  metadataFee={5} 
  currency="USD" 
  xlmToUsdRate={0.12} 
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseFee` | `number` | required | Base network transaction fee in XLM |
| `metadataFee` | `number` | `0` | Additional fee for metadata storage in XLM |
| `currency` | `'XLM' \| 'USD'` | `'XLM'` | Display currency |
| `xlmToUsdRate` | `number` | `undefined` | XLM to USD conversion rate |
| `className` | `string` | `''` | Additional CSS classes |

## Fee Descriptions

The component includes helpful tooltips for each fee type:

- **Base Fee**: Network transaction fee required to deploy the token contract on Stellar
- **Metadata Fee**: Additional fee for storing token metadata (image and description) on IPFS
- **Total Fee**: Total cost to deploy your token including all fees

## Examples

### Basic Fee Display
```tsx
<FeeBreakdown baseFee={1.5} />
```
Shows only the base fee and total (which equals base fee).

### With Metadata
```tsx
<FeeBreakdown baseFee={1.5} metadataFee={0.5} />
```
Shows base fee, metadata fee, and total (2.0 XLM).

### With Currency Conversion
```tsx
<FeeBreakdown 
  baseFee={10} 
  metadataFee={5} 
  currency="XLM" 
  xlmToUsdRate={0.12} 
/>
```
Shows fees in XLM with USD equivalent displayed below.

### USD Display
```tsx
<FeeBreakdown 
  baseFee={10} 
  metadataFee={5} 
  currency="USD" 
  xlmToUsdRate={0.12} 
/>
```
Shows all fees directly in USD.

## Styling

The component uses Tailwind CSS classes and can be customized with the `className` prop:

```tsx
<FeeBreakdown 
  baseFee={1.5} 
  className="shadow-lg border-2 border-blue-500" 
/>
```

## Accessibility

- Info icons have proper `aria-label` attributes
- Tooltips use the `role="tooltip"` attribute
- Keyboard navigation supported for tooltip triggers
- Proper color contrast for text and backgrounds

## Testing

The component includes comprehensive tests covering:
- Basic rendering
- Fee calculations
- Currency display
- Tooltips
- Styling and responsiveness
- Edge cases
- Accessibility

Run tests with:
```bash
npm test FeeBreakdown.test.tsx
```

## Storybook

View all component variations in Storybook:
```bash
npm run storybook
```

Navigate to Components > FeeBreakdown to see all stories.

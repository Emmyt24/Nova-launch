import type { Meta, StoryObj } from '@storybook/react';
import { FeeBreakdown } from './FeeBreakdown';

const meta = {
    title: 'Components/FeeBreakdown',
    component: FeeBreakdown,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        baseFee: {
            control: { type: 'number', min: 0, step: 0.1 },
            description: 'Base network transaction fee in XLM',
        },
        metadataFee: {
            control: { type: 'number', min: 0, step: 0.1 },
            description: 'Additional fee for metadata storage',
        },
        currency: {
            control: { type: 'radio' },
            options: ['XLM', 'USD'],
            description: 'Display currency',
        },
        xlmToUsdRate: {
            control: { type: 'number', min: 0, step: 0.01 },
            description: 'XLM to USD conversion rate',
        },
        className: {
            control: 'text',
            description: 'Additional CSS classes',
        },
    },
} satisfies Meta<typeof FeeBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        baseFee: 1.5,
    },
};

export const WithMetadata: Story = {
    args: {
        baseFee: 1.5,
        metadataFee: 0.5,
    },
};

export const WithUSDConversion: Story = {
    args: {
        baseFee: 10,
        metadataFee: 5,
        currency: 'XLM',
        xlmToUsdRate: 0.12,
    },
};

export const USDDisplay: Story = {
    args: {
        baseFee: 10,
        metadataFee: 5,
        currency: 'USD',
        xlmToUsdRate: 0.12,
    },
};

export const HighFees: Story = {
    args: {
        baseFee: 100,
        metadataFee: 50,
        currency: 'XLM',
        xlmToUsdRate: 0.12,
    },
};

export const LowFees: Story = {
    args: {
        baseFee: 0.1,
        metadataFee: 0.05,
        currency: 'XLM',
    },
};

export const NoMetadata: Story = {
    args: {
        baseFee: 2.5,
        metadataFee: 0,
    },
};

export const PreciseDecimals: Story = {
    args: {
        baseFee: 1.234567,
        metadataFee: 0.123456,
        currency: 'XLM',
    },
};

export const CustomStyling: Story = {
    args: {
        baseFee: 1.5,
        metadataFee: 0.5,
        className: 'shadow-lg border-2 border-blue-500',
    },
};

export const Interactive: Story = {
    args: {
        baseFee: 1.5,
        metadataFee: 0.5,
        currency: 'XLM',
        xlmToUsdRate: 0.12,
    },
    parameters: {
        docs: {
            description: {
                story: 'Hover over the info icons to see tooltips with fee explanations.',
            },
        },
    },
};

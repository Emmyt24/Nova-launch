import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeeBreakdown } from './FeeBreakdown';

describe('FeeBreakdown', () => {
    describe('Basic Rendering', () => {
        it('renders with base fee only', () => {
            render(<FeeBreakdown baseFee={1.5} />);

            expect(screen.getByText('Fee Breakdown')).toBeInTheDocument();
            expect(screen.getByText('Base Fee')).toBeInTheDocument();
            expect(screen.getByText('Total Fee')).toBeInTheDocument();
            const xlmElements = screen.getAllByText(/1\.50.*XLM/);
            expect(xlmElements.length).toBeGreaterThan(0);
        });

        it('renders with base fee and metadata fee', () => {
            render(<FeeBreakdown baseFee={1.5} metadataFee={0.5} />);

            expect(screen.getByText('Base Fee')).toBeInTheDocument();
            expect(screen.getByText('Metadata Fee')).toBeInTheDocument();
            expect(screen.getByText('Total Fee')).toBeInTheDocument();
        });

        it('does not render metadata fee row when metadataFee is 0', () => {
            render(<FeeBreakdown baseFee={1.5} metadataFee={0} />);

            expect(screen.queryByText('Metadata Fee')).not.toBeInTheDocument();
        });

        it('does not render metadata fee row when metadataFee is undefined', () => {
            render(<FeeBreakdown baseFee={1.5} />);

            expect(screen.queryByText('Metadata Fee')).not.toBeInTheDocument();
        });
    });

    describe('Fee Calculations', () => {
        it('calculates total fee correctly with metadata', () => {
            render(<FeeBreakdown baseFee={1.5} metadataFee={0.5} />);

            const totalFeeElements = screen.getAllByText(/2\.0.*XLM/);
            expect(totalFeeElements.length).toBeGreaterThan(0);
        });

        it('calculates total fee correctly without metadata', () => {
            render(<FeeBreakdown baseFee={1.5} />);

            const totalFeeElements = screen.getAllByText(/1\.5.*XLM/);
            expect(totalFeeElements.length).toBeGreaterThan(0);
        });

        it('handles decimal precision correctly', () => {
            render(<FeeBreakdown baseFee={1.234567} metadataFee={0.123456} />);

            expect(screen.getByText(/1\.234567.*XLM/)).toBeInTheDocument();
            expect(screen.getByText(/0\.123456.*XLM/)).toBeInTheDocument();
        });
    });

    describe('Currency Display', () => {
        it('displays XLM by default', () => {
            render(<FeeBreakdown baseFee={1.5} />);

            const xlmElements = screen.getAllByText(/XLM/);
            expect(xlmElements.length).toBeGreaterThan(0);
        });

        it('displays USD when currency is USD and rate is provided', () => {
            render(<FeeBreakdown baseFee={1.5} currency="USD" xlmToUsdRate={0.12} />);

            const usdElements = screen.getAllByText(/\$0\.18/);
            expect(usdElements.length).toBeGreaterThan(0);
        });

        it('shows USD equivalent when XLM currency with rate provided', () => {
            render(<FeeBreakdown baseFee={10} metadataFee={5} currency="XLM" xlmToUsdRate={0.12} />);

            expect(screen.getByText(/\$1\.80 USD/)).toBeInTheDocument();
        });

        it('does not show USD equivalent when rate is not provided', () => {
            render(<FeeBreakdown baseFee={10} currency="XLM" />);

            expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
        });
    });

    describe('Tooltips', () => {
        it('shows tooltip on hover for base fee', async () => {
            render(<FeeBreakdown baseFee={1.5} />);

            const infoIcons = screen.getAllByLabelText('More information');
            fireEvent.mouseEnter(infoIcons[0]);

            expect(
                await screen.findByText(/Network transaction fee required to deploy/)
            ).toBeInTheDocument();
        });

        it('shows tooltip on hover for metadata fee', async () => {
            render(<FeeBreakdown baseFee={1.5} metadataFee={0.5} />);

            const infoIcons = screen.getAllByLabelText('More information');
            fireEvent.mouseEnter(infoIcons[1]);

            expect(
                await screen.findByText(/Additional fee for storing token metadata/)
            ).toBeInTheDocument();
        });

        it('shows tooltip on hover for total fee', async () => {
            render(<FeeBreakdown baseFee={1.5} />);

            const infoIcons = screen.getAllByLabelText('More information');
            const totalFeeIcon = infoIcons[infoIcons.length - 1];
            fireEvent.mouseEnter(totalFeeIcon);

            expect(
                await screen.findByText(/Total cost to deploy your token/)
            ).toBeInTheDocument();
        });
    });

    describe('Styling and Responsiveness', () => {
        it('applies custom className', () => {
            const { container } = render(<FeeBreakdown baseFee={1.5} className="custom-class" />);

            const feeBreakdown = container.querySelector('.custom-class');
            expect(feeBreakdown).toBeInTheDocument();
        });

        it('highlights total fee row', () => {
            render(<FeeBreakdown baseFee={1.5} />);

            const totalFeeRow = screen.getByText('Total Fee').closest('div')?.parentElement;
            expect(totalFeeRow).toHaveClass('font-semibold');
        });

        it('renders with proper spacing between rows', () => {
            const { container } = render(<FeeBreakdown baseFee={1.5} metadataFee={0.5} />);

            const spaceContainer = container.querySelector('.space-y-1');
            expect(spaceContainer).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('handles zero base fee', () => {
            render(<FeeBreakdown baseFee={0} />);

            const zeroElements = screen.getAllByText(/0\.00.*XLM/);
            expect(zeroElements.length).toBeGreaterThan(0);
        });

        it('handles very large fees', () => {
            render(<FeeBreakdown baseFee={1000000} metadataFee={500000} />);

            expect(screen.getByText(/1,000,000/)).toBeInTheDocument();
            const metadataElements = screen.getAllByText(/500,000/);
            expect(metadataElements.length).toBeGreaterThan(0);
        });

        it('handles very small fees', () => {
            render(<FeeBreakdown baseFee={0.0000001} />);

            const smallElements = screen.getAllByText(/0\.0000001.*XLM/);
            expect(smallElements.length).toBeGreaterThan(0);
        });

        it('handles negative fees gracefully', () => {
            render(<FeeBreakdown baseFee={-1.5} />);

            const negativeElements = screen.getAllByText(/-1\.50.*XLM/);
            expect(negativeElements.length).toBeGreaterThan(0);
        });

        it('handles zero USD rate', () => {
            render(<FeeBreakdown baseFee={10} currency="XLM" xlmToUsdRate={0} />);

            // When rate is 0, it should still show the USD equivalent section with $0.00
            expect(screen.getByText(/≈ \$0\.00 USD/)).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has proper ARIA labels for info icons', () => {
            render(<FeeBreakdown baseFee={1.5} metadataFee={0.5} />);

            const infoIcons = screen.getAllByLabelText('More information');
            expect(infoIcons.length).toBe(3); // base, metadata, total
        });

        it('tooltips have proper role', async () => {
            render(<FeeBreakdown baseFee={1.5} />);

            const infoIcons = screen.getAllByLabelText('More information');
            fireEvent.mouseEnter(infoIcons[0]);

            const tooltip = await screen.findByRole('tooltip');
            expect(tooltip).toBeInTheDocument();
        });
    });
});

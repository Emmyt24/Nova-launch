import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';
import type { ConfirmDialogProps } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
    const defaultProps: ConfirmDialogProps = {
        isOpen: true,
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        title: 'Test Dialog',
        message: 'This is a test message',
        action: 'custom',
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        document.body.style.overflow = 'unset';
    });

    describe('Rendering', () => {
        it('should render when isOpen is true', () => {
            render(<ConfirmDialog {...defaultProps} />);
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(screen.getByText('Test Dialog')).toBeInTheDocument();
            expect(screen.getByText('This is a test message')).toBeInTheDocument();
        });

        it('should not render when isOpen is false', () => {
            render(<ConfirmDialog {...defaultProps} isOpen={false} />);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should render custom button text', () => {
            render(
                <ConfirmDialog
                    {...defaultProps}
                    confirmText="Deploy Now"
                    cancelText="Go Back"
                />
            );
            expect(screen.getByText('Deploy Now')).toBeInTheDocument();
            expect(screen.getByText('Go Back')).toBeInTheDocument();
        });

        it('should render fee breakdown when fees are provided', () => {
            const fees = [
                { label: 'Base Fee', amount: '0.00001 XLM' },
                { label: 'Gas Fee', amount: '0.00005 XLM' },
            ];
            render(<ConfirmDialog {...defaultProps} fees={fees} />);
            
            expect(screen.getByText('Fee Breakdown')).toBeInTheDocument();
            expect(screen.getByText('Base Fee')).toBeInTheDocument();
            expect(screen.getByText('0.00001 XLM')).toBeInTheDocument();
            expect(screen.getByText('Gas Fee')).toBeInTheDocument();
            expect(screen.getByText('0.00005 XLM')).toBeInTheDocument();
        });

        it('should render fee descriptions when provided', () => {
            const fees = [
                { 
                    label: 'Base Fee', 
                    amount: '0.00001 XLM',
                    description: 'Network transaction fee'
                },
            ];
            render(<ConfirmDialog {...defaultProps} fees={fees} />);
            
            expect(screen.getByText('Network transaction fee')).toBeInTheDocument();
        });

        it('should calculate and display total fee', () => {
            const fees = [
                { label: 'Fee 1', amount: '0.00001 XLM' },
                { label: 'Fee 2', amount: '0.00005 XLM' },
            ];
            render(<ConfirmDialog {...defaultProps} fees={fees} />);
            
            expect(screen.getByText('0.0000600 XLM')).toBeInTheDocument();
        });

        it('should render consequences when provided', () => {
            const consequences = [
                'This action cannot be undone',
                'Fees will be deducted',
            ];
            render(<ConfirmDialog {...defaultProps} consequences={consequences} />);
            
            expect(screen.getByText('Important')).toBeInTheDocument();
            expect(screen.getByText('This action cannot be undone')).toBeInTheDocument();
            expect(screen.getByText('Fees will be deducted')).toBeInTheDocument();
        });

        it('should render explicit confirmation checkbox when required', () => {
            render(<ConfirmDialog {...defaultProps} requireExplicitConfirm={true} />);
            
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toBeInTheDocument();
            expect(screen.getByText(/I understand the consequences/)).toBeInTheDocument();
        });

        it('should render keyboard hints when not requiring explicit confirm', () => {
            render(<ConfirmDialog {...defaultProps} requireExplicitConfirm={false} />);
            
            expect(screen.getByText(/Press/)).toBeInTheDocument();
            expect(screen.getByText('Enter')).toBeInTheDocument();
            expect(screen.getByText('Esc')).toBeInTheDocument();
        });
    });

    describe('User Interactions', () => {
        it('should call onConfirm when confirm button is clicked', async () => {
            const onConfirm = vi.fn();
            render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
            
            const confirmButton = screen.getByText('Confirm');
            fireEvent.click(confirmButton);
            
            await waitFor(() => {
                expect(onConfirm).toHaveBeenCalledTimes(1);
            });
        });

        it('should call onClose when cancel button is clicked', () => {
            const onClose = vi.fn();
            render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
            
            const cancelButton = screen.getByText('Cancel');
            fireEvent.click(cancelButton);
            
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('should call onClose when backdrop is clicked', () => {
            const onClose = vi.fn();
            render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
            
            const backdrop = screen.getByRole('dialog').parentElement;
            if (backdrop) {
                fireEvent.click(backdrop);
                expect(onClose).toHaveBeenCalledTimes(1);
            }
        });

        it('should not close when dialog content is clicked', () => {
            const onClose = vi.fn();
            render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
            
            const dialog = screen.getByRole('dialog');
            fireEvent.click(dialog);
            
            expect(onClose).not.toHaveBeenCalled();
        });

        it('should require checkbox to be checked before confirming', async () => {
            const onConfirm = vi.fn();
            render(
                <ConfirmDialog
                    {...defaultProps}
                    onConfirm={onConfirm}
                    requireExplicitConfirm={true}
                />
            );
            
            const confirmButton = screen.getByText('Confirm');
            expect(confirmButton).toBeDisabled();
            
            const checkbox = screen.getByRole('checkbox');
            fireEvent.click(checkbox);
            
            await waitFor(() => {
                expect(confirmButton).not.toBeDisabled();
            });
            
            fireEvent.click(confirmButton);
            
            await waitFor(() => {
                expect(onConfirm).toHaveBeenCalledTimes(1);
            });
        });

        it('should disable buttons when isProcessing is true', () => {
            render(<ConfirmDialog {...defaultProps} isProcessing={true} />);
            
            const confirmButton = screen.getByText('Confirm');
            const cancelButton = screen.getByText('Cancel');
            
            expect(confirmButton).toBeDisabled();
            expect(cancelButton).toBeDisabled();
        });
    });

    describe('Keyboard Accessibility', () => {
        it('should close dialog when Escape key is pressed', () => {
            const onClose = vi.fn();
            render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
            
            fireEvent.keyDown(document, { key: 'Escape' });
            
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('should confirm when Enter key is pressed (without explicit confirm)', async () => {
            const onConfirm = vi.fn();
            render(
                <ConfirmDialog
                    {...defaultProps}
                    onConfirm={onConfirm}
                    requireExplicitConfirm={false}
                />
            );
            
            fireEvent.keyDown(document, { key: 'Enter' });
            
            await waitFor(() => {
                expect(onConfirm).toHaveBeenCalledTimes(1);
            });
        });

        it('should not confirm with Enter when explicit confirm is required', () => {
            const onConfirm = vi.fn();
            render(
                <ConfirmDialog
                    {...defaultProps}
                    onConfirm={onConfirm}
                    requireExplicitConfirm={true}
                />
            );
            
            fireEvent.keyDown(document, { key: 'Enter' });
            
            expect(onConfirm).not.toHaveBeenCalled();
        });

        it('should not close when Escape is pressed during processing', () => {
            const onClose = vi.fn();
            render(<ConfirmDialog {...defaultProps} onClose={onClose} isProcessing={true} />);
            
            fireEvent.keyDown(document, { key: 'Escape' });
            
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe('Action Icons', () => {
        it('should render deploy icon for deploy action', () => {
            const { container } = render(<ConfirmDialog {...defaultProps} action="deploy" />);
            const iconContainer = container.querySelector('.bg-blue-100');
            expect(iconContainer).toBeInTheDocument();
        });

        it('should render mint icon for mint action', () => {
            const { container } = render(<ConfirmDialog {...defaultProps} action="mint" />);
            const iconContainer = container.querySelector('.bg-blue-100');
            expect(iconContainer).toBeInTheDocument();
        });

        it('should render burn icon for burn action', () => {
            const { container } = render(<ConfirmDialog {...defaultProps} action="burn" />);
            const iconContainer = container.querySelector('.bg-red-100');
            expect(iconContainer).toBeInTheDocument();
        });

        it('should render danger styling for danger variant', () => {
            const { container } = render(
                <ConfirmDialog {...defaultProps} confirmButtonVariant="danger" />
            );
            const iconContainer = container.querySelector('.bg-red-100');
            expect(iconContainer).toBeInTheDocument();
        });
    });

    describe('Body Scroll Lock', () => {
        it('should lock body scroll when dialog opens', () => {
            render(<ConfirmDialog {...defaultProps} isOpen={true} />);
            expect(document.body.style.overflow).toBe('hidden');
        });

        it('should unlock body scroll when dialog closes', () => {
            const { rerender } = render(<ConfirmDialog {...defaultProps} isOpen={true} />);
            expect(document.body.style.overflow).toBe('hidden');
            
            rerender(<ConfirmDialog {...defaultProps} isOpen={false} />);
            expect(document.body.style.overflow).toBe('unset');
        });

        it('should unlock body scroll on unmount', () => {
            const { unmount } = render(<ConfirmDialog {...defaultProps} isOpen={true} />);
            expect(document.body.style.overflow).toBe('hidden');
            
            unmount();
            expect(document.body.style.overflow).toBe('unset');
        });
    });

    describe('Async Confirmation', () => {
        it('should handle async onConfirm', async () => {
            const onConfirm = vi.fn().mockResolvedValue(undefined);
            render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
            
            const confirmButton = screen.getByText('Confirm');
            fireEvent.click(confirmButton);
            
            await waitFor(() => {
                expect(onConfirm).toHaveBeenCalledTimes(1);
            });
        });

        it('should show loading state during async confirmation', async () => {
            const onConfirm = vi.fn().mockImplementation(
                () => new Promise(resolve => setTimeout(resolve, 100))
            );
            render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
            
            const confirmButton = screen.getByText('Confirm');
            fireEvent.click(confirmButton);
            
            // Button should be disabled during processing
            expect(confirmButton).toBeDisabled();
            
            await waitFor(() => {
                expect(onConfirm).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('Accessibility', () => {
        it('should have proper ARIA attributes', () => {
            render(<ConfirmDialog {...defaultProps} />);
            
            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveAttribute('aria-modal', 'true');
            expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title');
            expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-description');
        });

        it('should have accessible title', () => {
            render(<ConfirmDialog {...defaultProps} title="Deploy Token" />);
            
            const title = screen.getByText('Deploy Token');
            expect(title).toHaveAttribute('id', 'confirm-dialog-title');
        });

        it('should have accessible description', () => {
            render(<ConfirmDialog {...defaultProps} message="Confirm deployment" />);
            
            const description = screen.getByText('Confirm deployment');
            expect(description).toHaveAttribute('id', 'confirm-dialog-description');
        });
    });
});

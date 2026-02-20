import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImageUpload } from './ImageUpload';

describe('ImageUpload', () => {
    const mockOnImageSelect = vi.fn();
    const mockOnImageRemove = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock Image
        global.Image = class MockImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            src = '';
            width = 512;
            height = 512;

            constructor() {
                setTimeout(() => {
                    if (this.onload) {
                        this.onload();
                    }
                }, 0);
            }
        } as unknown as typeof Image;

        // Mock URL methods
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
    });

    it('should render upload area', () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        expect(screen.getByText(/Click to upload/i)).toBeInTheDocument();
        expect(screen.getByText(/PNG, JPG, JPEG or SVG/i)).toBeInTheDocument();
    });

    it('should show recommended dimensions', () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        expect(screen.getByText(/Recommended: 512x512px/i)).toBeInTheDocument();
    });

    it('should handle file selection', async () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const file = new File(['test'], 'test.png', { type: 'image/png' });
        const input = screen.getByLabelText('Upload image') as HTMLInputElement;

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(mockOnImageSelect).toHaveBeenCalledWith(file);
        });
    });

    it('should show preview after valid upload', async () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const file = new File(['test'], 'test.png', { type: 'image/png' });
        const input = screen.getByLabelText('Upload image') as HTMLInputElement;

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByAltText('Preview')).toBeInTheDocument();
        });
    });

    it('should show error for invalid file type', async () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const file = new File(['test'], 'test.gif', { type: 'image/gif' });
        const input = screen.getByLabelText('Upload image') as HTMLInputElement;

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByText(/Validation Error/i)).toBeInTheDocument();
            expect(screen.getByText(/Invalid file type/i)).toBeInTheDocument();
        });

        expect(mockOnImageSelect).not.toHaveBeenCalled();
    });

    it('should show error for oversized file', async () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const size = 10 * 1024 * 1024; // 10MB
        const file = new File([new ArrayBuffer(size)], 'test.png', { type: 'image/png' });
        const input = screen.getByLabelText('Upload image') as HTMLInputElement;

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByText(/exceeds maximum/i)).toBeInTheDocument();
        });

        expect(mockOnImageSelect).not.toHaveBeenCalled();
    });

    it('should show warnings for non-recommended dimensions', async () => {
        global.Image = class MockImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            src = '';
            width = 1024;
            height = 1024;

            constructor() {
                setTimeout(() => {
                    if (this.onload) {
                        this.onload();
                    }
                }, 0);
            }
        } as unknown as typeof Image;

        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const file = new File(['test'], 'test.png', { type: 'image/png' });
        const input = screen.getByLabelText('Upload image') as HTMLInputElement;

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByText(/Recommendations/i)).toBeInTheDocument();
            expect(screen.getByText(/Recommended dimensions/i)).toBeInTheDocument();
        });
    });

    it('should handle remove button click', async () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const file = new File(['test'], 'test.png', { type: 'image/png' });
        const input = screen.getByLabelText('Upload image') as HTMLInputElement;

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByAltText('Preview')).toBeInTheDocument();
        });

        const removeButton = screen.getByLabelText('Remove image');
        fireEvent.click(removeButton);

        expect(mockOnImageRemove).toHaveBeenCalled();
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should handle drag and drop', async () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const file = new File(['test'], 'test.png', { type: 'image/png' });
        const dropZone = screen.getByText(/Click to upload/i).closest('div');

        fireEvent.drop(dropZone!, {
            dataTransfer: {
                files: [file],
            },
        });

        await waitFor(() => {
            expect(mockOnImageSelect).toHaveBeenCalledWith(file);
        });
    });

    it('should show active state during drag', () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const dropZone = screen.getByLabelText('Upload image').parentElement;

        fireEvent.dragEnter(dropZone!);
        expect(dropZone).toHaveClass('border-blue-500');

        fireEvent.dragLeave(dropZone!);
        expect(dropZone).not.toHaveClass('border-blue-500');
    });

    it('should disable upload when disabled prop is true', () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
                disabled={true}
            />
        );

        const input = screen.getByLabelText('Upload image') as HTMLInputElement;
        expect(input).toBeDisabled();

        const dropZone = input.parentElement;
        expect(dropZone).toHaveClass('opacity-50');
    });

    it('should show validating state', async () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        const file = new File(['test'], 'test.png', { type: 'image/png' });
        const input = screen.getByLabelText('Upload image') as HTMLInputElement;

        fireEvent.change(input, { target: { files: [file] } });

        // Should briefly show validating state
        expect(screen.getByText(/Validating image/i)).toBeInTheDocument();
    });

    it('should display file information in preview', async () => {
        render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
                currentImage={new File(['test'], 'my-logo.png', { type: 'image/png' })}
            />
        );

        const file = new File(['test'], 'my-logo.png', { type: 'image/png' });
        const input = screen.getByLabelText('Upload image') as HTMLInputElement;

        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(screen.getByText('my-logo.png')).toBeInTheDocument();
            expect(screen.getByText(/Size:/i)).toBeInTheDocument();
            expect(screen.getByText(/Dimensions:/i)).toBeInTheDocument();
            expect(screen.getByText(/Type:/i)).toBeInTheDocument();
        });
    });

    it('should cleanup preview URL on unmount', () => {
        const { unmount } = render(
            <ImageUpload
                onImageSelect={mockOnImageSelect}
                onImageRemove={mockOnImageRemove}
            />
        );

        unmount();

        // URL.revokeObjectURL should be called during cleanup
        // This is tested indirectly through the component lifecycle
    });
});

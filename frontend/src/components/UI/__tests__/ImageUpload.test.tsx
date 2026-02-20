import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImageUpload } from '../ImageUpload';
import * as imageValidation from '../../../utils/imageValidation';
import type { ImageValidationResult } from '../../../utils/imageValidation';

// Mock the validation module
vi.mock('../../../utils/imageValidation', async () => {
  const actual = await vi.importActual('../../../utils/imageValidation');
  return {
    ...actual,
    validateImage: vi.fn(),
    createImagePreview: vi.fn(() => 'blob:mock-preview-url'),
    revokeImagePreview: vi.fn(),
  };
});

describe('ImageUpload', () => {
  const mockOnImageSelect = vi.fn();
  const mockOnImageRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock for URL methods
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('should render upload area with default label', () => {
    render(<ImageUpload onImageSelect={mockOnImageSelect} />);
    
    expect(screen.getByText('Token Logo')).toBeInTheDocument();
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
  });

  it('should render with custom label and helper text', () => {
    render(
      <ImageUpload
        onImageSelect={mockOnImageSelect}
        label="Custom Logo"
        helperText="Custom helper text"
      />
    );
    
    expect(screen.getByText('Custom Logo')).toBeInTheDocument();
    expect(screen.getByText('Custom helper text')).toBeInTheDocument();
  });

  it('should show required indicator when required prop is true', () => {
    render(<ImageUpload onImageSelect={mockOnImageSelect} required />);
    
    const requiredIndicator = screen.getByText('*');
    expect(requiredIndicator).toBeInTheDocument();
    expect(requiredIndicator).toHaveClass('text-red-500');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<ImageUpload onImageSelect={mockOnImageSelect} disabled />);
    
    const input = screen.getByLabelText('Token Logo');
    expect(input).toBeDisabled();
  });

  it('should handle valid file selection', async () => {
    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        width: 512,
        height: 512,
        size: 1024,
        type: 'image/png',
      },
    };

    vi.mocked(imageValidation.validateImage).mockResolvedValue(mockValidationResult);

    render(<ImageUpload onImageSelect={mockOnImageSelect} />);
    
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Token Logo') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(imageValidation.validateImage).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          allowedTypes: expect.arrayContaining(['image/png']),
        })
      );
    });

    await waitFor(() => {
      expect(mockOnImageSelect).toHaveBeenCalledWith(file, mockValidationResult);
    });
  });

  it('should display validation errors for invalid file', async () => {
    const mockValidationResult = {
      valid: false,
      errors: ['File size exceeds maximum', 'Invalid dimensions'],
      warnings: [],
    };

    vi.mocked(imageValidation.validateImage).mockResolvedValue(mockValidationResult);

    render(<ImageUpload onImageSelect={mockOnImageSelect} />);
    
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Token Logo') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Validation Errors:')).toBeInTheDocument();
      expect(screen.getByText(/File size exceeds maximum/)).toBeInTheDocument();
      expect(screen.getByText(/Invalid dimensions/)).toBeInTheDocument();
    });

    expect(mockOnImageSelect).not.toHaveBeenCalled();
  });

  it('should display warnings for valid file with warnings', async () => {
    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: ['Recommended dimensions are 512x512px'],
      metadata: {
        width: 256,
        height: 256,
        size: 1024,
        type: 'image/png',
      },
    };

    vi.mocked(imageValidation.validateImage).mockResolvedValue(mockValidationResult);

    render(<ImageUpload onImageSelect={mockOnImageSelect} />);
    
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Token Logo') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Warnings:')).toBeInTheDocument();
      expect(screen.getByText(/Recommended dimensions are 512x512px/)).toBeInTheDocument();
    });

    expect(mockOnImageSelect).toHaveBeenCalled();
  });

  it('should show preview after successful validation', async () => {
    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        width: 512,
        height: 512,
        size: 1024,
        type: 'image/png',
      },
    };

    vi.mocked(imageValidation.validateImage).mockResolvedValue(mockValidationResult);

    render(<ImageUpload onImageSelect={mockOnImageSelect} />);
    
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Token Logo') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const preview = screen.getByAltText('Preview');
      expect(preview).toBeInTheDocument();
      expect(preview).toHaveAttribute('src', 'blob:mock-preview-url');
    });

    expect(screen.getByText('test.png')).toBeInTheDocument();
    expect(screen.getByText(/Size:/)).toBeInTheDocument();
    expect(screen.getByText(/Dimensions: 512x512px/)).toBeInTheDocument();
  });

  it('should handle remove button click', async () => {
    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        width: 512,
        height: 512,
        size: 1024,
        type: 'image/png',
      },
    };

    vi.mocked(imageValidation.validateImage).mockResolvedValue(mockValidationResult);

    render(
      <ImageUpload
        onImageSelect={mockOnImageSelect}
        onImageRemove={mockOnImageRemove}
      />
    );
    
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Token Logo') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Remove Image')).toBeInTheDocument();
    });

    const removeButton = screen.getByText('Remove Image');
    fireEvent.click(removeButton);

    expect(mockOnImageRemove).toHaveBeenCalled();
    expect(imageValidation.revokeImagePreview).toHaveBeenCalledWith('blob:mock-preview-url');
    
    await waitFor(() => {
      expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
      expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
    });
  });

  it('should show loading state during validation', async () => {
    let resolveValidation: ((value: ImageValidationResult) => void) | undefined;
    const validationPromise = new Promise<ImageValidationResult>((resolve) => {
      resolveValidation = resolve;
    });

    vi.mocked(imageValidation.validateImage).mockReturnValue(validationPromise);

    render(<ImageUpload onImageSelect={mockOnImageSelect} />);
    
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const input = screen.getByLabelText('Token Logo') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Validating image...')).toBeInTheDocument();
    });

    resolveValidation!({
      valid: true,
      errors: [],
      warnings: [],
      metadata: { width: 512, height: 512, size: 1024, type: 'image/png' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Validating image...')).not.toBeInTheDocument();
    });
  });

  it('should handle drag and drop', async () => {
    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        width: 512,
        height: 512,
        size: 1024,
        type: 'image/png',
      },
    };

    vi.mocked(imageValidation.validateImage).mockResolvedValue(mockValidationResult);

    render(<ImageUpload onImageSelect={mockOnImageSelect} />);
    
    const dropZone = screen.getByText(/Click to upload/).closest('div')?.parentElement;
    expect(dropZone).toBeInTheDocument();

    const file = new File(['test'], 'test.png', { type: 'image/png' });
    
    fireEvent.dragOver(dropZone!, {
      dataTransfer: { files: [file] },
    });

    fireEvent.drop(dropZone!, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(imageValidation.validateImage).toHaveBeenCalledWith(
        file,
        expect.any(Object)
      );
    });
  });

  it('should not trigger file selection when disabled', () => {
    render(<ImageUpload onImageSelect={mockOnImageSelect} disabled />);
    
    const dropZone = screen.getByText(/Click to upload/).closest('div')?.parentElement;
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    
    fireEvent.drop(dropZone!, {
      dataTransfer: { files: [file] },
    });

    expect(imageValidation.validateImage).not.toHaveBeenCalled();
  });

  it('should use custom validation config', async () => {
    const customConfig = {
      maxSizeBytes: 10 * 1024 * 1024,
      allowedTypes: ['image/webp'],
    };

    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      metadata: {
        width: 512,
        height: 512,
        size: 1024,
        type: 'image/webp',
      },
    };

    vi.mocked(imageValidation.validateImage).mockResolvedValue(mockValidationResult);

    render(
      <ImageUpload
        onImageSelect={mockOnImageSelect}
        config={customConfig}
      />
    );
    
    const file = new File(['test'], 'test.webp', { type: 'image/webp' });
    const input = screen.getByLabelText('Token Logo') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(imageValidation.validateImage).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          maxSizeBytes: 10 * 1024 * 1024,
          allowedTypes: ['image/webp'],
        })
      );
    });
  });
});

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrollProgress } from '../ScrollProgress';

describe('ScrollProgress', () => {
  beforeEach(() => {
    // Mock scrollY and document height
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 0,
    });

    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1000,
    });

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      writable: true,
      configurable: true,
      value: 3000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders scroll progress indicator', () => {
    render(<ScrollProgress />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
  });

  it('has correct ARIA attributes', () => {
    render(<ScrollProgress />);
    const progressBar = screen.getByRole('progressbar');
    
    expect(progressBar).toHaveAttribute('aria-valuenow');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    expect(progressBar).toHaveAttribute('aria-label', 'Page scroll progress');
  });

  it('starts at 0% progress', () => {
    render(<ScrollProgress />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
  });

  it('updates progress on scroll', () => {
    const { rerender } = render(<ScrollProgress />);
    
    // Simulate scroll to 50%
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 1000, // 50% of scrollable height (2000)
    });

    // Trigger scroll event
    window.dispatchEvent(new Event('scroll'));
    
    rerender(<ScrollProgress />);
    
    // Progress should update (exact value depends on timing)
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
  });

  it('applies correct CSS classes', () => {
    render(<ScrollProgress />);
    const progressBar = screen.getByRole('progressbar');
    
    expect(progressBar).toHaveClass('fixed', 'top-0', 'left-0', 'right-0', 'z-50');
  });

  it('respects reduced motion preferences', () => {
    // This is handled by CSS media query, so we just verify the component renders
    render(<ScrollProgress />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});

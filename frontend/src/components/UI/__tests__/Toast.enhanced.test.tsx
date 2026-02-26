import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Toast, type ToastAction } from '../Toast';

describe('Toast Component - Enhanced Features', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Action Buttons', () => {
    it('renders action button when provided', () => {
      const action: ToastAction = {
        label: 'Undo',
        onClick: vi.fn(),
      };

      render(
        <Toast
          id="test"
          message="File deleted"
          type="success"
          onClose={vi.fn()}
          action={action}
        />
      );

      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    });

    it('calls action onClick and dismisses toast', async () => {
      const user = userEvent.setup({ delay: null });
      const actionFn = vi.fn();
      const onClose = vi.fn();
      const action: ToastAction = {
        label: 'Retry',
        onClick: actionFn,
      };

      render(
        <Toast
          id="test"
          message="Upload failed"
          type="error"
          onClose={onClose}
          action={action}
          duration={10000}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Retry' });
      await user.click(actionButton);

      expect(actionFn).toHaveBeenCalledTimes(1);
      
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onClose).toHaveBeenCalledWith('test');
    });

    it('does not render action button when not provided', () => {
      render(
        <Toast
          id="test"
          message="Simple message"
          type="info"
          onClose={vi.fn()}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1); // Only dismiss button
      expect(buttons[0]).toHaveAttribute('aria-label', 'Dismiss notification');
    });
  });

  describe('Progress Bar', () => {
    it('renders progress bar when showProgress is true', () => {
      render(
        <Toast
          id="test"
          message="Processing..."
          type="info"
          onClose={vi.fn()}
          showProgress={true}
          duration={5000}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('does not render progress bar when showProgress is false', () => {
      render(
        <Toast
          id="test"
          message="No progress"
          type="info"
          onClose={vi.fn()}
          showProgress={false}
        />
      );

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('progress bar decreases over time', async () => {
      render(
        <Toast
          id="test"
          message="Loading..."
          type="info"
          onClose={vi.fn()}
          showProgress={true}
          duration={1000}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      
      // Initial state
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');

      // After 500ms (50% of duration)
      act(() => {
        vi.advanceTimersByTime(500);
      });

      await waitFor(() => {
        const value = Number(progressBar.getAttribute('aria-valuenow'));
        expect(value).toBeLessThan(60);
        expect(value).toBeGreaterThan(40);
      });
    });

    it('does not render progress bar when duration is 0', () => {
      render(
        <Toast
          id="test"
          message="Persistent"
          type="info"
          onClose={vi.fn()}
          showProgress={true}
          duration={0}
        />
      );

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('Animations', () => {
    it('applies enter animation on mount', () => {
      const { container } = render(
        <Toast
          id="test"
          message="Animated"
          type="success"
          onClose={vi.fn()}
        />
      );

      const toast = container.firstChild as HTMLElement;
      
      // Initially should have exit classes
      expect(toast.className).toContain('opacity-0');
      expect(toast.className).toContain('scale-95');

      // After animation frame, should have enter classes
      act(() => {
        vi.runAllTimers();
      });
    });

    it('applies exit animation on dismiss', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();

      const { container } = render(
        <Toast
          id="test"
          message="Will dismiss"
          type="info"
          onClose={onClose}
          duration={10000}
        />
      );

      const dismissButton = screen.getByRole('button', { name: 'Dismiss notification' });
      await user.click(dismissButton);

      const toast = container.firstChild as HTMLElement;
      expect(toast.className).toContain('opacity-0');

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(onClose).toHaveBeenCalledWith('test');
    });
  });

  describe('Auto-dismiss', () => {
    it('auto-dismisses after duration', () => {
      const onClose = vi.fn();

      render(
        <Toast
          id="test"
          message="Auto dismiss"
          type="info"
          onClose={onClose}
          duration={3000}
        />
      );

      expect(onClose).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(onClose).toHaveBeenCalledWith('test');
    });

    it('does not auto-dismiss when duration is 0', () => {
      const onClose = vi.fn();

      render(
        <Toast
          id="test"
          message="Persistent"
          type="info"
          onClose={onClose}
          duration={0}
        />
      );

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA role for error toast', () => {
      const { container } = render(
        <Toast
          id="test"
          message="Error occurred"
          type="error"
          onClose={vi.fn()}
        />
      );

      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveAttribute('role', 'alert');
      expect(toast).toHaveAttribute('aria-live', 'assertive');
    });

    it('has correct ARIA role for info toast', () => {
      const { container } = render(
        <Toast
          id="test"
          message="Info message"
          type="info"
          onClose={vi.fn()}
        />
      );

      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveAttribute('role', 'status');
      expect(toast).toHaveAttribute('aria-live', 'polite');
    });

    it('action button has accessible label', () => {
      const action: ToastAction = {
        label: 'Undo',
        onClick: vi.fn(),
      };

      render(
        <Toast
          id="test"
          message="Action toast"
          type="success"
          onClose={vi.fn()}
          action={action}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Undo' });
      expect(actionButton).toHaveAttribute('aria-label', 'Undo');
    });

    it('progress bar has ARIA attributes', () => {
      render(
        <Toast
          id="test"
          message="Progress"
          type="info"
          onClose={vi.fn()}
          showProgress={true}
          duration={5000}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });
  });

  describe('Icons', () => {
    it('renders success icon', () => {
      const { container } = render(
        <Toast
          id="test"
          message="Success"
          type="success"
          onClose={vi.fn()}
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders error icon', () => {
      const { container } = render(
        <Toast
          id="test"
          message="Error"
          type="error"
          onClose={vi.fn()}
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders warning icon', () => {
      const { container } = render(
        <Toast
          id="test"
          message="Warning"
          type="warning"
          onClose={vi.fn()}
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('renders info icon', () => {
      const { container } = render(
        <Toast
          id="test"
          message="Info"
          type="info"
          onClose={vi.fn()}
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });
});

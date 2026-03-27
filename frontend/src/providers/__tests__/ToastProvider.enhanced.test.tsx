import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ToastProvider, useToastContext } from '../../../providers/ToastProvider';
import type { ToastAction } from '../Toast';

function TestComponent() {
  const { success, error, info, warning, showToast, clearToasts, toasts } = useToastContext();

  return (
    <div>
      <button onClick={() => success('Success message')}>Show Success</button>
      <button onClick={() => error('Error message')}>Show Error</button>
      <button onClick={() => info('Info message')}>Show Info</button>
      <button onClick={() => warning('Warning message')}>Show Warning</button>
      <button
        onClick={() =>
          showToast('With action', 'info', {
            action: { label: 'Undo', onClick: () => console.log('Undo') },
          })
        }
      >
        Show With Action
      </button>
      <button
        onClick={() =>
          showToast('No progress', 'info', { showProgress: false })
        }
      >
        Show Without Progress
      </button>
      <button onClick={clearToasts}>Clear All</button>
      <div data-testid="toast-count">{toasts.length}</div>
    </div>
  );
}

describe('ToastProvider - Enhanced Features', () => {
  describe('Action Buttons', () => {
    it('shows toast with action button', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show With Action'));

      await waitFor(() => {
        expect(screen.getByText('With action')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
      });
    });

    it('action button works correctly', async () => {
      const user = userEvent.setup();
      const actionFn = vi.fn();

      function TestWithAction() {
        const { showToast } = useToastContext();
        const action: ToastAction = {
          label: 'Test Action',
          onClick: actionFn,
        };

        return (
          <button onClick={() => showToast('Message', 'info', { action })}>
            Show Toast
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestWithAction />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Toast'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Test Action' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Test Action' }));

      expect(actionFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Progress Bar', () => {
    it('shows progress bar by default', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));

      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });
    });

    it('hides progress bar when showProgress is false', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Without Progress'));

      await waitFor(() => {
        expect(screen.getByText('No progress')).toBeInTheDocument();
      });

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('Dismiss All Button', () => {
    it('shows dismiss all button when multiple toasts exist', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));
      await user.click(screen.getByText('Show Error'));

      await waitFor(() => {
        expect(screen.getByText(/Dismiss All/)).toBeInTheDocument();
      });
    });

    it('dismiss all button shows correct count', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));
      await user.click(screen.getByText('Show Error'));
      await user.click(screen.getByText('Show Info'));

      await waitFor(() => {
        expect(screen.getByText('Dismiss All (3)')).toBeInTheDocument();
      });
    });

    it('dismiss all button clears all toasts', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));
      await user.click(screen.getByText('Show Error'));
      await user.click(screen.getByText('Show Info'));

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('3');
      });

      const dismissAllButton = screen.getByText(/Dismiss All/);
      await user.click(dismissAllButton);

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('does not show dismiss all button with single toast', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));

      await waitFor(() => {
        expect(screen.getByText('Success message')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Dismiss All/)).not.toBeInTheDocument();
    });
  });

  describe('Queue Management', () => {
    it('respects maxVisible limit', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider maxVisible={2}>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));
      await user.click(screen.getByText('Show Error'));
      await user.click(screen.getByText('Show Info'));

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('3');
      });

      // Only 2 should be visible
      const toasts = screen.getAllByRole('status');
      expect(toasts.length).toBeLessThanOrEqual(2);
    });

    it('respects maxQueue limit', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider maxQueue={2}>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));
      await user.click(screen.getByText('Show Error'));
      await user.click(screen.getByText('Show Info'));

      await waitFor(() => {
        const count = screen.getByTestId('toast-count');
        expect(Number(count.textContent)).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('Positioning', () => {
    it('applies correct position classes for top-right', () => {
      const { container } = render(
        <ToastProvider position="top-right">
          <TestComponent />
        </ToastProvider>
      );

      const toastContainer = container.querySelector('[role="region"]');
      expect(toastContainer?.className).toContain('top-4');
      expect(toastContainer?.className).toContain('right-4');
    });

    it('applies correct position classes for bottom-left', () => {
      const { container } = render(
        <ToastProvider position="bottom-left">
          <TestComponent />
        </ToastProvider>
      );

      const toastContainer = container.querySelector('[role="region"]');
      expect(toastContainer?.className).toContain('bottom-4');
      expect(toastContainer?.className).toContain('left-4');
    });

    it('applies correct position classes for top-center', () => {
      const { container } = render(
        <ToastProvider position="top-center">
          <TestComponent />
        </ToastProvider>
      );

      const toastContainer = container.querySelector('[role="region"]');
      expect(toastContainer?.className).toContain('top-4');
      expect(toastContainer?.className).toContain('left-1/2');
    });
  });

  describe('Custom Duration', () => {
    it('accepts custom duration option', async () => {
      const user = userEvent.setup();

      function TestCustomDuration() {
        const { showToast } = useToastContext();

        return (
          <button onClick={() => showToast('Custom', 'info', { duration: 10000 })}>
            Show Custom
          </button>
        );
      }

      render(
        <ToastProvider>
          <TestCustomDuration />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Custom'));

      await waitFor(() => {
        expect(screen.getByText('Custom')).toBeInTheDocument();
      });
    });
  });

  describe('Toast Types', () => {
    it('shows success toast', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Success'));

      await waitFor(() => {
        expect(screen.getByText('Success message')).toBeInTheDocument();
      });
    });

    it('shows error toast', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Error'));

      await waitFor(() => {
        expect(screen.getByText('Error message')).toBeInTheDocument();
      });
    });

    it('shows info toast', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Info'));

      await waitFor(() => {
        expect(screen.getByText('Info message')).toBeInTheDocument();
      });
    });

    it('shows warning toast', async () => {
      const user = userEvent.setup();

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      await user.click(screen.getByText('Show Warning'));

      await waitFor(() => {
        expect(screen.getByText('Warning message')).toBeInTheDocument();
      });
    });
  });
});

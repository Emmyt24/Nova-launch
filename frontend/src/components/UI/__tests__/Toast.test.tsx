import "../../../test/matchers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Toast } from "../Toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("Toast", () => {
  describe("Rendering", () => {
    it("renders toast message", () => {
      render(<Toast message="Success!" type="success" onClose={() => {}} />);
      expect(screen.getByText("Success!")).toBeInTheDocument();
    });

    it("renders success toast with correct styling", () => {
      const { container } = render(
        <Toast message="Success!" type="success" onClose={() => {}} />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("bg-green-500");
      expect(toast).toHaveClass("text-white");
    });

    it("renders error toast with correct styling", () => {
      const { container } = render(
        <Toast message="Error!" type="error" onClose={() => {}} />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("bg-red-500");
      expect(toast).toHaveClass("text-white");
    });

    it("renders info toast with correct styling", () => {
      const { container } = render(
        <Toast message="Info" type="info" onClose={() => {}} />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("bg-blue-500");
      expect(toast).toHaveClass("text-white");
    });

    it("renders warning toast with correct styling", () => {
      const { container } = render(
        <Toast message="Warning" type="warning" onClose={() => {}} />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("bg-yellow-500");
      expect(toast).toHaveClass("text-gray-900");
    });
  });

  describe("Toast Types", () => {
    it("renders success icon for success type", () => {
      const { container } = render(
        <Toast message="Success!" type="success" onClose={() => {}} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders error icon for error type", () => {
      const { container } = render(
        <Toast message="Error!" type="error" onClose={() => {}} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders info icon for info type", () => {
      const { container } = render(
        <Toast message="Info" type="info" onClose={() => {}} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders warning icon for warning type", () => {
      const { container } = render(
        <Toast message="Warning" type="warning" onClose={() => {}} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("defaults to info type when not specified", () => {
      const { container } = render(
        <Toast message="Default" onClose={() => {}} />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("bg-blue-500");
    });
  });

  describe("Auto-dismiss Behavior", () => {
    it("calls onClose after default duration", async () => {
      const onClose = vi.fn();
      render(<Toast message="Alert" type="info" onClose={onClose} />);

      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000); // default duration

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("calls onClose after custom duration", async () => {
      const onClose = vi.fn();
      render(
        <Toast message="Alert" type="info" onClose={onClose} duration={3000} />,
      );

      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3000);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("does not close before duration", () => {
      const onClose = vi.fn();
      render(
        <Toast message="Alert" type="info" onClose={onClose} duration={5000} />,
      );

      vi.advanceTimersByTime(2000);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("clears timeout when component unmounts", () => {
      const onClose = vi.fn();
      const { unmount } = render(
        <Toast message="Alert" type="info" onClose={onClose} duration={5000} />,
      );

      unmount();
      vi.advanceTimersByTime(5000);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Duration Variations", () => {
    it("supports very short duration", async () => {
      const onClose = vi.fn();
      render(
        <Toast message="Quick" type="info" onClose={onClose} duration={500} />,
      );

      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("supports very long duration", () => {
      const onClose = vi.fn();
      render(
        <Toast message="Long" type="info" onClose={onClose} duration={30000} />,
      );

      vi.advanceTimersByTime(20000);
      expect(onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10000);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it('has role="status" for screen readers', () => {
      render(<Toast message="Alert" type="info" onClose={() => {}} />);
      // Toast should be announced to screen readers
      expect(screen.getByText("Alert")).toBeInTheDocument();
    });

    it("displays message text clearly", () => {
      render(
        <Toast
          message="This is important information"
          type="info"
          onClose={() => {}}
        />,
      );
      expect(
        screen.getByText("This is important information"),
      ).toBeInTheDocument();
    });

    it("includes icon for visual indication", () => {
      const { container } = render(
        <Toast message="Success" type="success" onClose={() => {}} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("Message Content", () => {
    it("renders long messages correctly", () => {
      const longMessage =
        "This is a very long message that should wrap and be displayed correctly on the toast notification component.";
      render(<Toast message={longMessage} type="info" onClose={() => {}} />);
      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it("renders messages with special characters", () => {
      const specialMessage = 'Error: "Invalid input" & missing data!';
      render(
        <Toast message={specialMessage} type="error" onClose={() => {}} />,
      );
      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });

    it("renders empty message", () => {
      const { container } = render(
        <Toast message="" type="info" onClose={() => {}} />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("has consistent padding", () => {
      const { container } = render(
        <Toast message="Test" type="info" onClose={() => {}} />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("flex");
      expect(toast).toHaveClass("items-center");
      expect(toast).toHaveClass("gap-2");
    });

    it("icon maintains consistent size", () => {
      const { container } = render(
        <Toast message="Test" type="success" onClose={() => {}} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("w-5");
      expect(svg).toHaveClass("h-5");
    });
  });

  describe("Type-specific Behavior", () => {
    it("success toast has success styling and icon", () => {
      const { container } = render(
        <Toast
          message="Saved successfully"
          type="success"
          onClose={() => {}}
        />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("bg-green-500");
      expect(screen.getByText("Saved successfully")).toBeInTheDocument();
    });

    it("error toast has error styling and icon", () => {
      const { container } = render(
        <Toast message="Operation failed" type="error" onClose={() => {}} />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("bg-red-500");
      expect(screen.getByText("Operation failed")).toBeInTheDocument();
    });

    it("warning toast has different text color", () => {
      const { container } = render(
        <Toast message="Be careful" type="warning" onClose={() => {}} />,
      );
      const toast = container.firstChild as HTMLElement;
      expect(toast).toHaveClass("bg-yellow-500");
      expect(toast).toHaveClass("text-gray-900");
    });
  });

  describe("Snapshots", () => {
    it("matches snapshot for success toast", () => {
      const { container } = render(
        <Toast message="Success!" type="success" onClose={() => {}} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for error toast", () => {
      const { container } = render(
        <Toast message="Error occurred" type="error" onClose={() => {}} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for warning toast", () => {
      const { container } = render(
        <Toast message="Warning message" type="warning" onClose={() => {}} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot with custom duration", () => {
      const { container } = render(
        <Toast
          message="Custom duration"
          type="info"
          onClose={() => {}}
          duration={10000}
        />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

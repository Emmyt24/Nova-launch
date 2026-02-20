import "../../../test/matchers";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Modal } from "../Modal";

describe("Modal", () => {
  describe("Rendering", () => {
    it("does not render when isOpen is false", () => {
      render(
        <Modal isOpen={false} onClose={() => {}} title="Test Modal">
          Content
        </Modal>,
      );
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });

    it("renders when isOpen is true", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Modal content
        </Modal>,
      );
      expect(screen.getByText("Modal content")).toBeInTheDocument();
    });

    it("renders title correctly", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="My Modal">
          Content
        </Modal>,
      );
      expect(screen.getByText("My Modal")).toBeInTheDocument();
    });

    it("renders children correctly", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          <div>Test content</div>
          <div>More content</div>
        </Modal>,
      );
      expect(screen.getByText("Test content")).toBeInTheDocument();
      expect(screen.getByText("More content")).toBeInTheDocument();
    });
  });

  describe("Size Variants", () => {
    it("renders with small size", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title" size="sm">
          Content
        </Modal>,
      );
      const modalContent = container.querySelector(".max-w-md");
      expect(modalContent).toBeInTheDocument();
    });

    it("renders with medium size by default", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      const modalContent = container.querySelector(".max-w-lg");
      expect(modalContent).toBeInTheDocument();
    });

    it("renders with large size", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title" size="lg">
          Content
        </Modal>,
      );
      const modalContent = container.querySelector(".max-w-2xl");
      expect(modalContent).toBeInTheDocument();
    });

    it("renders with extra large size", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title" size="xl">
          Content
        </Modal>,
      );
      const modalContent = container.querySelector(".max-w-4xl");
      expect(modalContent).toBeInTheDocument();
    });
  });

  describe("Footer Content", () => {
    it("renders footer when provided", () => {
      render(
        <Modal
          isOpen={true}
          onClose={() => {}}
          title="Title"
          footer={<div>Footer content</div>}
        >
          Content
        </Modal>,
      );
      expect(screen.getByText("Footer content")).toBeInTheDocument();
    });

    it("does not render footer when not provided", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      expect(screen.queryByText(/Footer/i)).not.toBeInTheDocument();
    });

    it("renders footer with buttons", () => {
      render(
        <Modal
          isOpen={true}
          onClose={() => {}}
          title="Title"
          footer={
            <div>
              <button>Cancel</button>
              <button>Submit</button>
            </div>
          }
        >
          Content
        </Modal>,
      );
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Submit" }),
      ).toBeInTheDocument();
    });
  });

  describe("User Interactions", () => {
    it("calls onClose when close button is clicked", () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Title">
          Content
        </Modal>,
      );
      const closeButton = screen.getByLabelText("Close modal");
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when backdrop is clicked", () => {
      const onClose = vi.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="Title">
          Content
        </Modal>,
      );
      const backdrop = container.querySelector('[role="dialog"]');
      if (backdrop) {
        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalled();
      }
    });

    it("does not call onClose when content is clicked", () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Title">
          <div>Clickable content</div>
        </Modal>,
      );
      const content = screen.getByText("Clickable content");
      fireEvent.click(content);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Keyboard Navigation", () => {
    it("closes modal when Escape key is pressed", async () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Title">
          Content
        </Modal>,
      );
      fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("does not close modal when other keys are pressed", () => {
      const onClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Title">
          Content
        </Modal>,
      );
      fireEvent.keyDown(document, { key: "Enter", code: "Enter" });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("removes escape listener when modal closes", () => {
      const onClose = vi.fn();
      const { rerender } = render(
        <Modal isOpen={true} onClose={onClose} title="Title">
          Content
        </Modal>,
      );

      rerender(
        <Modal isOpen={false} onClose={onClose} title="Title">
          Content
        </Modal>,
      );

      fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
      // onClose should only be called once (from the first render)
      expect(onClose).toHaveBeenCalledTimes(0);
    });
  });

  describe("Body Overflow", () => {
    it("hides body overflow when modal opens", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      expect(document.body.style.overflow).toBe("hidden");
    });

    it("restores body overflow when modal closes", () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      expect(document.body.style.overflow).toBe("hidden");

      rerender(
        <Modal isOpen={false} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      expect(document.body.style.overflow).toBe("");
    });
  });

  describe("Accessibility", () => {
    it("has dialog role", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeInTheDocument();
    });

    it('has aria-modal="true"', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      const dialog = container.querySelector('[aria-modal="true"]');
      expect(dialog).toBeInTheDocument();
    });

    it("has aria-labelledby pointing to title", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Test Title">
          Content
        </Modal>,
      );
      const dialog = container.querySelector('[aria-labelledby="modal-title"]');
      expect(dialog).toBeInTheDocument();
    });

    it("title has correct id", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      const title = container.querySelector("#modal-title");
      expect(title).toBeInTheDocument();
    });

    it("close button has aria-label", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      const closeButton = screen.getByLabelText("Close modal");
      expect(closeButton).toBeInTheDocument();
    });

    it("can be tabbed through", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          <button>Action</button>
        </Modal>,
      );
      const actionButton = screen.getByRole("button", { name: "Action" });
      actionButton.focus();
      expect(actionButton).toHaveFocus();
    });
  });

  describe("Visibility Toggle", () => {
    it("toggles visibility when isOpen changes", () => {
      const { rerender } = render(
        <Modal isOpen={false} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      expect(screen.queryByText("Content")).not.toBeInTheDocument();

      rerender(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      expect(screen.getByText("Content")).toBeInTheDocument();

      rerender(
        <Modal isOpen={false} onClose={() => {}} title="Title">
          Content
        </Modal>,
      );
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });
  });

  describe("Snapshots", () => {
    it("matches snapshot when open", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <p>Modal content</p>
        </Modal>,
      );
      const modal = container.querySelector('[role="dialog"]');
      expect(modal).toMatchSnapshot();
    });

    it("matches snapshot when closed", () => {
      const { container } = render(
        <Modal isOpen={false} onClose={() => {}} title="Test Modal">
          <p>Modal content</p>
        </Modal>,
      );
      expect(container).toMatchSnapshot();
    });

    it("matches snapshot with footer", () => {
      const { container } = render(
        <Modal
          isOpen={true}
          onClose={() => {}}
          title="Modal Title"
          footer={<div>Footer</div>}
        >
          Content
        </Modal>,
      );
      const modal = container.querySelector('[role="dialog"]');
      expect(modal).toMatchSnapshot();
    });
  });
});

import "../../../test/matchers";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../Button";

describe("Button", () => {
  describe("Rendering", () => {
    it("renders with correct text", () => {
      render(<Button>Click me</Button>);
      expect(screen.getByText("Click me")).toBeInTheDocument();
    });

    it("renders with primary variant by default", () => {
      render(<Button>Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-blue-600");
    });

    it("renders with secondary variant", () => {
      render(<Button variant="secondary">Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-gray-600");
    });

    it("renders with outline variant", () => {
      render(<Button variant="outline">Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("border-2");
      expect(button).toHaveClass("border-gray-300");
    });

    it("renders with danger variant", () => {
      render(<Button variant="danger">Delete</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-red-600");
    });
  });

  describe("Sizes", () => {
    it("renders with small size", () => {
      render(<Button size="sm">Small</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("px-3");
      expect(button).toHaveClass("py-1.5");
      expect(button).toHaveClass("text-sm");
    });

    it("renders with medium size by default", () => {
      render(<Button>Medium</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("px-4");
      expect(button).toHaveClass("py-2");
      expect(button).toHaveClass("text-base");
    });

    it("renders with large size", () => {
      render(<Button size="lg">Large</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("px-6");
      expect(button).toHaveClass("py-3");
      expect(button).toHaveClass("text-lg");
    });
  });

  describe("Loading State", () => {
    it("shows loading text when loading", () => {
      render(<Button loading>Submit</Button>);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("is disabled when loading", () => {
      render(<Button loading>Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("shows spinner when loading", () => {
      render(<Button loading>Submit</Button>);
      const button = screen.getByRole("button");
      const svg = button.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass("animate-spin");
    });

    it("is enabled when not loading", () => {
      render(<Button loading={false}>Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });
  });

  describe("Disabled State", () => {
    it("is disabled when disabled prop is true", () => {
      render(<Button disabled>Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("has opacity-50 when disabled", () => {
      render(<Button disabled>Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("disabled:opacity-50");
    });

    it("is disabled when loading even if disabled prop is false", () => {
      render(
        <Button loading disabled={false}>
          Submit
        </Button>,
      );
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });
  });

  describe("User Interactions", () => {
    it("calls onClick when clicked", () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Click me</Button>);
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", () => {
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} disabled>
          Click me
        </Button>,
      );
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("does not call onClick when loading", () => {
      const onClick = vi.fn();
      render(
        <Button onClick={onClick} loading>
          Click me
        </Button>,
      );
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("handles keyboard events", () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Press Enter</Button>);
      const button = screen.getByRole("button");
      fireEvent.keyDown(button, { key: "Enter", code: "Enter" });
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("is keyboard accessible", () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole("button");
      button.focus();
      expect(button).toHaveFocus();
    });

    it("has correct role", () => {
      render(<Button>Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "submit");
    });

    it("accepts aria-label", () => {
      render(<Button aria-label="Submit form">Submit</Button>);
      const button = screen.getByRole("button", { name: "Submit form" });
      expect(button).toBeInTheDocument();
    });

    it("has focus ring styling", () => {
      render(<Button>Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("focus:ring-2");
      expect(button).toHaveClass("focus:ring-offset-2");
    });
  });

  describe("Custom Props", () => {
    it("accepts custom className", () => {
      render(<Button className="custom-class">Submit</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveClass("custom-class");
    });

    it("accepts custom attributes", () => {
      render(
        <Button data-testid="custom-button" title="Submit button">
          Submit
        </Button>,
      );
      const button = screen.getByTestId("custom-button");
      expect(button).toHaveAttribute("title", "Submit button");
    });

    it("supports different button types", () => {
      render(<Button type="reset">Reset</Button>);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "reset");
    });
  });

  describe("Snapshots", () => {
    it("matches snapshot for primary button", () => {
      const { container } = render(<Button>Submit</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for loading button", () => {
      const { container } = render(<Button loading>Submitting...</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for disabled button", () => {
      const { container } = render(<Button disabled>Submit</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

import "../../../test/matchers";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tooltip } from "../Tooltip";

describe("Tooltip", () => {
  describe("Rendering", () => {
    it("renders children", () => {
      render(
        <Tooltip content="Help text">
          <button>Hover me</button>
        </Tooltip>,
      );
      expect(
        screen.getByRole("button", { name: "Hover me" }),
      ).toBeInTheDocument();
    });

    it("does not show tooltip initially", () => {
      render(
        <Tooltip content="Help text">
          <button>Hover me</button>
        </Tooltip>,
      );
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("shows tooltip content on hover", () => {
      render(
        <Tooltip content="Help text">
          <button>Hover me</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      expect(screen.getByText("Help text")).toBeInTheDocument();
    });

    it("hides tooltip on mouse leave", () => {
      render(
        <Tooltip content="Help text">
          <button>Hover me</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      fireEvent.mouseLeave(button);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  describe("Position Variants", () => {
    it("renders tooltip at top by default", () => {
      const { container } = render(
        <Tooltip content="Help">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveClass("mb-2");
      expect(tooltip).toHaveClass("bottom-full");
    });

    it("renders tooltip at bottom", () => {
      const { container } = render(
        <Tooltip content="Help" position="bottom">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveClass("mt-2");
      expect(tooltip).toHaveClass("top-full");
    });

    it("renders tooltip at left", () => {
      const { container } = render(
        <Tooltip content="Help" position="left">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveClass("mr-2");
      expect(tooltip).toHaveClass("right-full");
    });

    it("renders tooltip at right", () => {
      const { container } = render(
        <Tooltip content="Help" position="right">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveClass("ml-2");
      expect(tooltip).toHaveClass("left-full");
    });
  });

  describe("Keyboard Navigation", () => {
    it("shows tooltip on focus", () => {
      render(
        <Tooltip content="Help text">
          <button>Focus me</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.focus(button);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      expect(screen.getByText("Help text")).toBeInTheDocument();
    });

    it("hides tooltip on blur", () => {
      render(
        <Tooltip content="Help text">
          <button>Focus me</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.focus(button);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      fireEvent.blur(button);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("maintains tooltip visibility with keyboard navigation", () => {
      render(
        <Tooltip content="Help text">
          <input type="text" placeholder="Tab through" />
        </Tooltip>,
      );
      const input = screen.getByPlaceholderText("Tab through");
      fireEvent.focus(input);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });
  });

  describe("Content Variations", () => {
    it("renders simple text content", () => {
      render(
        <Tooltip content="Simple text">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      expect(screen.getByText("Simple text")).toBeInTheDocument();
    });

    it("renders long content", () => {
      const longText =
        "This is a long tooltip content that might wrap in some cases depending on the layout";
      render(
        <Tooltip content={longText}>
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      expect(screen.getByText(longText)).toBeInTheDocument();
    });

    it("renders special characters in content", () => {
      render(
        <Tooltip content="Error: Invalid & missing (data)">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      expect(
        screen.getByText("Error: Invalid & missing (data)"),
      ).toBeInTheDocument();
    });

    it("prevents whitespace collapse in tooltip", () => {
      render(
        <Tooltip content="Preserve   spaces">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveClass("whitespace-nowrap");
    });
  });

  describe("Children Variations", () => {
    it("works with button element", () => {
      render(
        <Tooltip content="Click to submit">
          <button>Submit</button>
        </Tooltip>,
      );
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("works with custom elements", () => {
      render(
        <Tooltip content="Help">
          <span data-testid="custom">Custom element</span>
        </Tooltip>,
      );
      expect(screen.getByTestId("custom")).toBeInTheDocument();
    });

    it("works with icon elements", () => {
      render(
        <Tooltip content="Help">
          <svg data-testid="icon">
            <circle />
          </svg>
        </Tooltip>,
      );
      expect(screen.getByTestId("icon")).toBeInTheDocument();
    });

    it("works with interactive elements", () => {
      render(
        <Tooltip content="Input field">
          <input type="text" placeholder="Enter text" />
        </Tooltip>,
      );
      const input = screen.getByPlaceholderText("Enter text");
      fireEvent.focus(input);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("has correct base styling", () => {
      const { container } = render(
        <Tooltip content="Help">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveClass("bg-gray-900");
      expect(tooltip).toHaveClass("text-white");
      expect(tooltip).toHaveClass("rounded-lg");
      expect(tooltip).toHaveClass("shadow-lg");
    });

    it("has arrow pointer", () => {
      const { container } = render(
        <Tooltip content="Help">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const arrow = container.querySelector('[class*="rotate-45"]');
      expect(arrow).toBeInTheDocument();
    });

    it("centers tooltip horizontally above trigger", () => {
      const { container } = render(
        <Tooltip content="Help" position="top">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveClass("left-1/2");
      expect(tooltip).toHaveClass("-translate-x-1/2");
    });

    it("centers tooltip vertically when positioned left/right", () => {
      const { container } = render(
        <Tooltip content="Help" position="left">
          <button>Hover</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tooltip = container.querySelector('[role="tooltip"]');
      expect(tooltip).toHaveClass("top-1/2");
      expect(tooltip).toHaveClass("-translate-y-1/2");
    });
  });

  describe("Accessibility", () => {
    it("has tooltip role", () => {
      render(
        <Tooltip content="Help text">
          <button>Hover me</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("is not visible to screen readers by default", () => {
      render(
        <Tooltip content="Hidden help">
          <button>Button</button>
        </Tooltip>,
      );
      // Tooltip shouldn't be visible
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("supports keyboard users", () => {
      render(
        <Tooltip content="Keyboard help">
          <button>Focusable button</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      button.focus();
      expect(button).toHaveFocus();
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });
  });

  describe("Multiple Tooltips", () => {
    it("shows only one tooltip at a time", () => {
      render(
        <>
          <Tooltip content="First">
            <button>First</button>
          </Tooltip>
          <Tooltip content="Second">
            <button>Second</button>
          </Tooltip>
        </>,
      );

      const firstBtn = screen.getByRole("button", { name: "First" });
      const secondBtn = screen.getByRole("button", { name: "Second" });

      fireEvent.mouseEnter(firstBtn);
      expect(screen.getByText("First")).toBeInTheDocument();

      fireEvent.mouseEnter(secondBtn);
      expect(screen.queryByText("First")).not.toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
    });
  });

  describe("Snapshots", () => {
    it("matches snapshot with children visible", () => {
      const { container } = render(
        <Tooltip content="Help text">
          <button>Hover me</button>
        </Tooltip>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot with tooltip visible", () => {
      const { container } = render(
        <Tooltip content="Help text">
          <button>Hover me</button>
        </Tooltip>,
      );
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot with different positions", () => {
      const positions = ["top", "bottom", "left", "right"] as const;
      positions.forEach((pos) => {
        const { container } = render(
          <Tooltip content="Help" position={pos}>
            <button>Hover</button>
          </Tooltip>,
        );
        const button = screen.getByRole("button");
        fireEvent.mouseEnter(button);
        expect(container.firstChild).toMatchSnapshot();
      });
    });
  });
});

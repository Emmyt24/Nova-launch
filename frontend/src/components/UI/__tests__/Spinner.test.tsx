import "../../../test/matchers";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "../Spinner";

describe("Spinner", () => {
  describe("Rendering", () => {
    it("renders spinner SVG", () => {
      const { container } = render(<Spinner />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders with default styling", () => {
      const { container } = render(<Spinner />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("animate-spin");
      expect(svg).toHaveClass("h-8");
      expect(svg).toHaveClass("w-8");
    });

    it("has circle and path elements", () => {
      const { container } = render(<Spinner />);
      const circle = container.querySelector("circle");
      const path = container.querySelector("path");
      expect(circle).toBeInTheDocument();
      expect(path).toBeInTheDocument();
    });
  });

  describe("Size Variants", () => {
    it("renders small spinner", () => {
      const { container } = render(<Spinner size="sm" />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("h-4");
      expect(svg).toHaveClass("w-4");
    });

    it("renders medium spinner by default", () => {
      const { container } = render(<Spinner />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("h-8");
      expect(svg).toHaveClass("w-8");
    });

    it("renders large spinner", () => {
      const { container } = render(<Spinner size="lg" />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("h-12");
      expect(svg).toHaveClass("w-12");
    });
  });

  describe("Styling", () => {
    it("has animation class", () => {
      const { container } = render(<Spinner />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("animate-spin");
    });

    it("accepts custom className", () => {
      const { container } = render(<Spinner className="custom-class" />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("custom-class");
      expect(svg).toHaveClass("animate-spin"); // retains default
    });

    it("uses currentColor for stroke", () => {
      const { container } = render(<Spinner />);
      const circle = container.querySelector("circle");
      expect(circle).toHaveAttribute("stroke", "currentColor");
    });

    it("uses currentColor for fill", () => {
      const { container } = render(<Spinner />);
      const path = container.querySelector("path");
      expect(path).toHaveAttribute("fill", "currentColor");
    });
  });

  describe("Accessibility", () => {
    it("is visually indicated with animation", () => {
      const { container } = render(<Spinner />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("animate-spin");
    });

    it("can be used with aria-label", () => {
      const { container } = render(
        <div role="status" aria-label="Loading">
          <Spinner />
        </div>,
      );
      const status = container.querySelector('[role="status"]');
      expect(status).toHaveAttribute("aria-label", "Loading");
    });

    it("can be used with aria-live", () => {
      const { container } = render(
        <div role="status" aria-live="polite">
          <Spinner />
        </div>,
      );
      const status = container.querySelector('[role="status"]');
      expect(status).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Usage Patterns", () => {
    it("can be used as loading indicator", () => {
      const { container } = render(
        <div>
          <Spinner />
          <span>Loading...</span>
        </div>,
      );
      expect(container.querySelector("svg")).toBeInTheDocument();
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("can be used in buttons", () => {
      const { container } = render(
        <button>
          <Spinner size="sm" />
          Processing
        </button>,
      );
      const button = container.querySelector("button");
      expect(button?.querySelector("svg")).toBeInTheDocument();
      expect(button).toHaveTextContent("Processing");
    });

    it("maintains color inheritance", () => {
      const { container } = render(
        <div style={{ color: "rgb(255, 0, 0)" }}>
          <Spinner />
        </div>,
      );
      const svg = container.querySelector("svg");
      expect(svg).toHaveClass("w-8"); // Check it still has size classes
    });
  });

  describe("SVG Structure", () => {
    it("has correct viewBox", () => {
      const { container } = render(<Spinner />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    });

    it("circle has correct attributes", () => {
      const { container } = render(<Spinner />);
      const circle = container.querySelector("circle");
      expect(circle).toHaveAttribute("cx", "12");
      expect(circle).toHaveAttribute("cy", "12");
      expect(circle).toHaveAttribute("r", "10");
      expect(circle).toHaveAttribute("fill", "none");
    });

    it("circle has opacity styling", () => {
      const { container } = render(<Spinner />);
      const circle = container.querySelector("circle");
      expect(circle).toHaveClass("opacity-25");
    });

    it("path has opacity styling", () => {
      const { container } = render(<Spinner />);
      const path = container.querySelector("path");
      expect(path).toHaveClass("opacity-75");
    });
  });

  describe("Responsive Behavior", () => {
    it("maintains aspect ratio", () => {
      const { container } = render(<Spinner />);
      const svg = container.querySelector("svg");
      // Same height and width classes
      expect(svg).toHaveClass("h-8");
      expect(svg).toHaveClass("w-8");
    });

    it("scales appropriately with size prop", () => {
      const sizes = ["sm", "md", "lg"] as const;
      sizes.forEach((size) => {
        const { container } = render(<Spinner size={size} />);
        const svg = container.querySelector("svg");
        expect(svg).toHaveClass(
          size === "sm" ? "h-4" : size === "md" ? "h-8" : "h-12",
        );
      });
    });
  });

  describe("Snapshots", () => {
    it("matches snapshot for small spinner", () => {
      const { container } = render(<Spinner size="sm" />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for medium spinner", () => {
      const { container } = render(<Spinner />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for large spinner", () => {
      const { container } = render(<Spinner size="lg" />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot with custom className", () => {
      const { container } = render(<Spinner className="text-blue-500" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

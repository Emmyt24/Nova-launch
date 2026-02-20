import "../../../test/matchers";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../Card";

describe("Card", () => {
  describe("Rendering", () => {
    it("renders children content", () => {
      render(<Card>Test content</Card>);
      expect(screen.getByText("Test content")).toBeInTheDocument();
    });

    it("renders with default styling", () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass("bg-white");
      expect(card).toHaveClass("rounded-lg");
      expect(card).toHaveClass("shadow-md");
      expect(card).toHaveClass("border");
      expect(card).toHaveClass("border-gray-200");
    });
  });

  describe("Title Prop", () => {
    it("renders title when provided", () => {
      render(<Card title="Card Title">Content</Card>);
      expect(screen.getByText("Card Title")).toBeInTheDocument();
    });

    it("does not render title when not provided", () => {
      render(<Card>Content</Card>);
      const title = screen.queryByText(/Card Title/i);
      expect(title).not.toBeInTheDocument();
    });

    it("renders title with correct styling", () => {
      const { container } = render(<Card title="My Title">Content</Card>);
      const titleElement = container.querySelector("h3");
      expect(titleElement).toHaveClass("text-lg");
      expect(titleElement).toHaveClass("font-semibold");
      expect(titleElement).toHaveClass("text-gray-900");
    });

    it("renders title in header section with border", () => {
      const { container } = render(<Card title="Section">Content</Card>);
      const header = container.querySelector("div:first-child");
      expect(header).toHaveClass("border-b");
      expect(header).toHaveClass("border-gray-200");
    });
  });

  describe("Content Layout", () => {
    it("renders content in padded section", () => {
      const { container } = render(<Card>Padded content</Card>);
      const content = container.querySelector("div:last-child");
      expect(content).toHaveClass("p-6");
      expect(screen.getByText("Padded content")).toBeInTheDocument();
    });

    it("renders title header and content separately", () => {
      const { container } = render(<Card title="Header">Body content</Card>);
      const sections = container.querySelectorAll("div > div");
      expect(sections.length).toBeGreaterThan(1);
    });

    it("renders multiple children", () => {
      render(
        <Card>
          <div>First child</div>
          <div>Second child</div>
          <div>Third child</div>
        </Card>,
      );
      expect(screen.getByText("First child")).toBeInTheDocument();
      expect(screen.getByText("Second child")).toBeInTheDocument();
      expect(screen.getByText("Third child")).toBeInTheDocument();
    });
  });

  describe("Custom Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <Card className="custom-class">Content</Card>,
      );
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass("custom-class");
    });

    it("retains default classes with custom className", () => {
      const { container } = render(
        <Card className="custom-class">Content</Card>,
      );
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass("bg-white");
      expect(card).toHaveClass("rounded-lg");
      expect(card).toHaveClass("custom-class");
    });

    it("applies multiple custom classes", () => {
      const { container } = render(
        <Card className="class1 class2 class3">Content</Card>,
      );
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass("class1");
      expect(card).toHaveClass("class2");
      expect(card).toHaveClass("class3");
    });
  });

  describe("Complex Content", () => {
    it("renders JSX elements as children", () => {
      render(
        <Card title="Products">
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
            <li>Item 3</li>
          </ul>
        </Card>,
      );
      expect(screen.getByText("Products")).toBeInTheDocument();
      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
      expect(screen.getByText("Item 3")).toBeInTheDocument();
    });

    it("renders with form elements", () => {
      render(
        <Card title="Form">
          <form>
            <input placeholder="Name" />
            <button>Submit</button>
          </form>
        </Card>,
      );
      expect(screen.getByPlaceholderText("Name")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("renders with nested components", () => {
      render(
        <Card title="Outer">
          <Card title="Inner">Inner content</Card>
        </Card>,
      );
      expect(screen.getByText("Outer")).toBeInTheDocument();
      expect(screen.getByText("Inner")).toBeInTheDocument();
      expect(screen.getByText("Inner content")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("title is semantic heading", () => {
      const { container } = render(<Card title="Main Title">Content</Card>);
      const heading = container.querySelector("h3");
      expect(heading?.tagName).toBe("H3");
    });

    it("has proper semantic structure", () => {
      const { container } = render(
        <Card title="Title">
          <p>Content</p>
        </Card>,
      );
      const divs = container.querySelectorAll("div");
      expect(divs.length).toBeGreaterThan(0);
    });
  });

  describe("Responsive Behavior", () => {
    it("maintains padding at all sizes", () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass("p-6");
    });

    it("maintains title section padding", () => {
      const { container } = render(<Card title="Test">Content</Card>);
      const header = container.querySelector("div:first-child");
      expect(header).toHaveClass("px-6");
      expect(header).toHaveClass("py-4");
    });
  });

  describe("Empty States", () => {
    it("renders with empty children", () => {
      const { container } = render(
        <Card>
          <div />
        </Card>,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders with empty title and empty children", () => {
      const { container } = render(<Card title="">Content</Card>);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe("Snapshots", () => {
    it("matches snapshot for basic card", () => {
      const { container } = render(<Card>Simple content</Card>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for card with title", () => {
      const { container } = render(
        <Card title="Card Title">Content inside card</Card>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for card with complex content", () => {
      const { container } = render(
        <Card title="Complex Card">
          <div>
            <p>First paragraph</p>
            <p>Second paragraph</p>
          </div>
        </Card>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for card with custom styling", () => {
      const { container } = render(
        <Card className="custom-style">Custom styled content</Card>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

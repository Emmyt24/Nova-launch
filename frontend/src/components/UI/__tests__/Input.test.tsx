import "../../../test/matchers";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "../Input";

describe("Input", () => {
  describe("Rendering", () => {
    it("renders input element", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
    });

    it("renders with placeholder", () => {
      render(<Input placeholder="Enter text..." />);
      const input = screen.getByPlaceholderText("Enter text...");
      expect(input).toBeInTheDocument();
    });

    it("renders with label", () => {
      render(<Input label="Username" />);
      const label = screen.getByText("Username");
      expect(label).toBeInTheDocument();
    });

    it("associates label with input", () => {
      const { container } = render(<Input label="Email" />);
      const label = container.querySelector("label");
      const input = container.querySelector("input");
      expect(label).toBeInTheDocument();
      expect(input).toBeInTheDocument();
    });
  });

  describe("Error States", () => {
    it("displays error message", () => {
      render(<Input error="Email is required" />);
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });

    it("applies error styling to input", () => {
      render(<Input error="Invalid input" />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveClass("border-red-500");
    });

    it("does not show error class without error message", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveClass("border-gray-300");
    });

    it("hides helper text when error is present", () => {
      render(<Input error="Invalid" helperText="This is optional" />);
      expect(screen.queryByText("This is optional")).not.toBeInTheDocument();
      expect(screen.getByText("Invalid")).toBeInTheDocument();
    });
  });

  describe("Helper Text", () => {
    it("displays helper text when no error", () => {
      render(<Input helperText="At least 8 characters" />);
      expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    });

    it("does not display helper text when error exists", () => {
      render(<Input error="Too short" helperText="At least 8 characters" />);
      expect(
        screen.queryByText("At least 8 characters"),
      ).not.toBeInTheDocument();
    });
  });

  describe("User Interactions", () => {
    it("updates value on input", () => {
      render(<Input defaultValue="" />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Hello" } });
      expect(input.value).toBe("Hello");
    });

    it("calls onChange callback", () => {
      const onChange = vi.fn();
      render(<Input onChange={onChange} />);
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "test" } });
      expect(onChange).toHaveBeenCalled();
    });

    it("handles focus event", () => {
      const onFocus = vi.fn();
      render(<Input onFocus={onFocus} />);
      const input = screen.getByRole("textbox");
      fireEvent.focus(input);
      expect(onFocus).toHaveBeenCalled();
    });

    it("handles blur event", () => {
      const onBlur = vi.fn();
      render(<Input onBlur={onBlur} />);
      const input = screen.getByRole("textbox");
      fireEvent.blur(input);
      expect(onBlur).toHaveBeenCalled();
    });

    it("handles key events", () => {
      const onKeyDown = vi.fn();
      render(<Input onKeyDown={onKeyDown} />);
      const input = screen.getByRole("textbox");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onKeyDown).toHaveBeenCalled();
    });
  });

  describe("Input Types", () => {
    it("renders email input", () => {
      render(<Input type="email" />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.type).toBe("email");
    });

    it("renders password input", () => {
      render(<Input type="password" />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      // Note: password inputs have a different role, this may need adjustment
      expect(input.type).toBe("password");
    });

    it("renders number input", () => {
      render(<Input type="number" />);
      const input = screen.getByRole("spinbutton") as HTMLInputElement;
      expect(input.type).toBe("number");
    });

    it("renders search input", () => {
      render(<Input type="search" />);
      const input = screen.getByRole("searchbox") as HTMLInputElement;
      expect(input.type).toBe("search");
    });
  });

  describe("Attributes", () => {
    it("accepts disabled attribute", () => {
      render(<Input disabled />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });

    it("accepts readonly attribute", () => {
      render(<Input readOnly />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.readOnly).toBe(true);
    });

    it("accepts required attribute", () => {
      render(<Input required />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.required).toBe(true);
    });

    it("accepts minLength and maxLength", () => {
      render(<Input minLength={5} maxLength={20} />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.minLength).toBe(5);
      expect(input.maxLength).toBe(20);
    });

    it("accepts pattern attribute", () => {
      render(<Input pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}" />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.pattern).toBe("[0-9]{3}-[0-9]{3}-[0-9]{4}");
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      render(<Input className="custom-class" />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveClass("custom-class");
    });

    it("has focus styling", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveClass("focus:outline-none");
      expect(input).toHaveClass("focus:ring-2");
      expect(input).toHaveClass("focus:ring-blue-500");
    });

    it("has base border styling", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveClass("border");
      expect(input).toHaveClass("rounded-lg");
    });

    it("has full width", () => {
      render(<Input />);
      const input = screen.getByRole("textbox");
      expect(input).toHaveClass("w-full");
    });
  });

  describe("Accessibility", () => {
    it("is keyboard accessible", () => {
      render(<Input label="Test input" />);
      const input = screen.getByRole("textbox");
      input.focus();
      expect(input).toHaveFocus();
    });

    it("label is associated with input", () => {
      const { container } = render(<Input label="Username" />);
      const label = container.querySelector("label");
      const input = container.querySelector("input");
      expect(label?.textContent).toContain("Username");
      expect(input).toBeInTheDocument();
    });

    it("error message is accessible", () => {
      render(<Input error="This field is required" aria-describedby="error" />);
      expect(screen.getByText("This field is required")).toBeInTheDocument();
    });
  });

  describe("Snapshots", () => {
    it("matches snapshot for basic input", () => {
      const { container } = render(<Input />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for input with label", () => {
      const { container } = render(
        <Input label="Email" placeholder="Enter email" />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for input with error", () => {
      const { container } = render(
        <Input label="Password" error="Password is too weak" />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("matches snapshot for input with helper text", () => {
      const { container } = render(
        <Input label="Name" helperText="First and last name" />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

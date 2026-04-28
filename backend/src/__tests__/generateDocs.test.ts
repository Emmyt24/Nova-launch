/**
 * Tests for automated documentation generation from code comments (#903)
 */

import { describe, it, expect } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import {
  stripJsdocLines,
  parseJsdocBlock,
  extractDocComments,
  collectSourceFiles,
  renderMarkdown,
} from "/workspaces/nova-launch/backend/scripts/generate-docs";

// ---------------------------------------------------------------------------
// stripJsdocLines
// ---------------------------------------------------------------------------

describe("stripJsdocLines", () => {
  it("removes leading asterisks and spaces", () => {
    const raw = `
 * First line.
 * Second line.
`;
    expect(stripJsdocLines(raw)).toBe("First line.\nSecond line.");
  });

  it("handles lines without asterisks", () => {
    expect(stripJsdocLines("  plain text  ")).toBe("plain text");
  });

  it("returns empty string for blank input", () => {
    expect(stripJsdocLines("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseJsdocBlock
// ---------------------------------------------------------------------------

describe("parseJsdocBlock", () => {
  it("parses description", () => {
    const raw = `
 * Does something useful.
 * Second line of description.
`;
    const doc = parseJsdocBlock(raw, "src/foo.ts", 10, "doSomething");
    expect(doc.description).toBe("Does something useful.\nSecond line of description.");
    expect(doc.symbol).toBe("doSomething");
    expect(doc.file).toBe("src/foo.ts");
    expect(doc.line).toBe(10);
  });

  it("parses @param tags", () => {
    const raw = `
 * Adds two numbers.
 * @param {number} a First operand.
 * @param {number} b Second operand.
`;
    const doc = parseJsdocBlock(raw, "src/math.ts", 1, "add");
    expect(doc.params).toHaveLength(2);
    expect(doc.params[0]).toEqual({ name: "a", type: "number", description: "First operand." });
    expect(doc.params[1]).toEqual({ name: "b", type: "number", description: "Second operand." });
  });

  it("parses @returns tag", () => {
    const raw = `
 * Gets a value.
 * @returns {string} The value.
`;
    const doc = parseJsdocBlock(raw, "src/x.ts", 1, "getValue");
    expect(doc.returns).toBe("{string} The value.");
  });

  it("parses @throws tags", () => {
    const raw = `
 * Risky operation.
 * @throws {Error} When something goes wrong.
`;
    const doc = parseJsdocBlock(raw, "src/x.ts", 1, "risky");
    expect(doc.throws).toHaveLength(1);
    expect(doc.throws[0]).toBe("{Error} When something goes wrong.");
  });

  it("parses @example tags", () => {
    const raw = `
 * Example function.
 * @example
 * const x = foo(1, 2);
`;
    const doc = parseJsdocBlock(raw, "src/x.ts", 1, "foo");
    expect(doc.examples).toHaveLength(1);
    expect(doc.examples[0]).toContain("const x = foo(1, 2)");
  });

  it("handles missing @param type gracefully", () => {
    const raw = `
 * No type param.
 * @param name The name.
`;
    const doc = parseJsdocBlock(raw, "src/x.ts", 1, "fn");
    expect(doc.params[0].type).toBe("");
    expect(doc.params[0].name).toBe("name");
  });

  it("returns null returns when @returns is absent", () => {
    const raw = ` * Just a description.`;
    const doc = parseJsdocBlock(raw, "src/x.ts", 1, null);
    expect(doc.returns).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractDocComments
// ---------------------------------------------------------------------------

describe("extractDocComments", () => {
  const tmpDir = join(tmpdir(), `nova-docs-test-${Date.now()}`);

  it("extracts comments from a TypeScript file", () => {
    mkdirSync(tmpDir, { recursive: true });
    const file = join(tmpDir, "sample.ts");
    writeFileSync(
      file,
      `
/**
 * Computes the sum.
 * @param {number} a First.
 * @param {number} b Second.
 * @returns {number} The sum.
 */
export function sum(a: number, b: number): number {
  return a + b;
}
`
    );

    const docs = extractDocComments(file, tmpDir);
    expect(docs).toHaveLength(1);
    expect(docs[0].symbol).toBe("sum");
    expect(docs[0].description).toBe("Computes the sum.");
    expect(docs[0].params).toHaveLength(2);
    expect(docs[0].returns).toBe("{number} The sum.");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("extracts multiple comments from one file", () => {
    mkdirSync(tmpDir, { recursive: true });
    const file = join(tmpDir, "multi.ts");
    writeFileSync(
      file,
      `
/** First function. */
export function alpha() {}

/** Second function. */
export function beta() {}
`
    );

    const docs = extractDocComments(file, tmpDir);
    expect(docs).toHaveLength(2);
    expect(docs[0].symbol).toBe("alpha");
    expect(docs[1].symbol).toBe("beta");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for file with no JSDoc", () => {
    mkdirSync(tmpDir, { recursive: true });
    const file = join(tmpDir, "nodoc.ts");
    writeFileSync(file, `export const x = 1; // inline comment`);

    const docs = extractDocComments(file, tmpDir);
    expect(docs).toHaveLength(0);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// collectSourceFiles
// ---------------------------------------------------------------------------

describe("collectSourceFiles", () => {
  const tmpDir = join(tmpdir(), `nova-collect-test-${Date.now()}`);

  it("collects .ts files and excludes test files", () => {
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "a.ts"), "");
    writeFileSync(join(tmpDir, "src", "b.ts"), "");
    writeFileSync(join(tmpDir, "src", "c.test.ts"), "");
    writeFileSync(join(tmpDir, "src", "d.spec.ts"), "");
    writeFileSync(join(tmpDir, "src", "e.d.ts"), "");

    const files = collectSourceFiles(join(tmpDir, "src"));
    const names = files.map((f) => f.split("/").pop());
    expect(names).toContain("a.ts");
    expect(names).toContain("b.ts");
    expect(names).not.toContain("c.test.ts");
    expect(names).not.toContain("d.spec.ts");
    expect(names).not.toContain("e.d.ts");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("recurses into subdirectories", () => {
    mkdirSync(join(tmpDir, "src", "sub"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "top.ts"), "");
    writeFileSync(join(tmpDir, "src", "sub", "nested.ts"), "");

    const files = collectSourceFiles(join(tmpDir, "src"));
    const names = files.map((f) => f.split("/").pop());
    expect(names).toContain("top.ts");
    expect(names).toContain("nested.ts");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("excludes node_modules", () => {
    mkdirSync(join(tmpDir, "src", "node_modules"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "real.ts"), "");
    writeFileSync(join(tmpDir, "src", "node_modules", "dep.ts"), "");

    const files = collectSourceFiles(join(tmpDir, "src"));
    const names = files.map((f) => f.split("/").pop());
    expect(names).toContain("real.ts");
    expect(names).not.toContain("dep.ts");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// renderMarkdown
// ---------------------------------------------------------------------------

describe("renderMarkdown", () => {
  it("renders a title and auto-generated notice", () => {
    const md = renderMarkdown([], "Test API");
    expect(md).toContain("# Test API");
    expect(md).toContain("Auto-generated from source code comments");
  });

  it("renders a symbol heading", () => {
    const docs: ReturnType<typeof parseJsdocBlock>[] = [
      {
        file: "src/foo.ts",
        line: 5,
        description: "Does foo.",
        params: [],
        returns: null,
        throws: [],
        examples: [],
        symbol: "fooFunction",
      },
    ];
    const md = renderMarkdown(docs, "API");
    expect(md).toContain("### `fooFunction`");
    expect(md).toContain("Does foo.");
    expect(md).toContain("`src/foo.ts`");
  });

  it("renders params table", () => {
    const docs: ReturnType<typeof parseJsdocBlock>[] = [
      {
        file: "src/bar.ts",
        line: 1,
        description: "Bar.",
        params: [{ name: "x", type: "number", description: "The x value." }],
        returns: "The result.",
        throws: [],
        examples: [],
        symbol: "bar",
      },
    ];
    const md = renderMarkdown(docs, "API");
    expect(md).toContain("| `x` | `number` | The x value. |");
    expect(md).toContain("**Returns:** The result.");
  });

  it("renders throws and examples", () => {
    const docs: ReturnType<typeof parseJsdocBlock>[] = [
      {
        file: "src/baz.ts",
        line: 1,
        description: "Baz.",
        params: [],
        returns: null,
        throws: ["{Error} When bad."],
        examples: ["const r = baz();"],
        symbol: "baz",
      },
    ];
    const md = renderMarkdown(docs, "API");
    expect(md).toContain("{Error} When bad.");
    expect(md).toContain("const r = baz();");
  });

  it("skips entries with no description and no symbol", () => {
    const docs: ReturnType<typeof parseJsdocBlock>[] = [
      {
        file: "src/empty.ts",
        line: 1,
        description: "",
        params: [],
        returns: null,
        throws: [],
        examples: [],
        symbol: null,
      },
    ];
    const md = renderMarkdown(docs, "API");
    expect(md).not.toContain("src/empty.ts");
  });

  it("groups entries by file", () => {
    const docs: ReturnType<typeof parseJsdocBlock>[] = [
      {
        file: "src/a.ts",
        line: 1,
        description: "A func.",
        params: [],
        returns: null,
        throws: [],
        examples: [],
        symbol: "aFunc",
      },
      {
        file: "src/b.ts",
        line: 1,
        description: "B func.",
        params: [],
        returns: null,
        throws: [],
        examples: [],
        symbol: "bFunc",
      },
    ];
    const md = renderMarkdown(docs, "API");
    expect(md).toContain("`src/a.ts`");
    expect(md).toContain("`src/b.ts`");
  });
});

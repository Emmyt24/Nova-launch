/**
 * Automated Documentation Generator
 *
 * Extracts JSDoc/TSDoc comments from TypeScript source files and generates
 * a structured Markdown documentation file. Runs as part of `npm run docs:generate`.
 *
 * Usage:
 *   npx tsx scripts/generate-docs.ts [--src <dir>] [--out <file>]
 *
 * Defaults:
 *   --src  src/
 *   --out  docs/API.md
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs";
import { join, relative, extname } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocComment {
  /** File path relative to project root */
  file: string;
  /** Line number where the comment starts (1-indexed) */
  line: number;
  /** Raw JSDoc description (first paragraph) */
  description: string;
  /** @param tags */
  params: Array<{ name: string; type: string; description: string }>;
  /** @returns tag */
  returns: string | null;
  /** @throws tags */
  throws: string[];
  /** @example tags */
  examples: string[];
  /** The symbol name immediately following the comment (function/class/const) */
  symbol: string | null;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const JSDOC_BLOCK_RE = /\/\*\*([\s\S]*?)\*\//g;
const PARAM_RE = /@param\s+(?:\{([^}]*)\}\s+)?(\S+)\s*(.*)/;
const RETURNS_RE = /@returns?\s+(.*)/;
const THROWS_RE = /@throws?\s+(.*)/;
const EXAMPLE_RE = /@example\s*([\s\S]*?)(?=@|\*\/|$)/;

/**
 * Strips leading `* ` from each line of a JSDoc block.
 */
export function stripJsdocLines(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();
}

/**
 * Parses a single JSDoc block string into a structured DocComment.
 */
export function parseJsdocBlock(
  raw: string,
  file: string,
  line: number,
  symbol: string | null
): DocComment {
  const cleaned = stripJsdocLines(raw);
  const lines = cleaned.split("\n");

  const descLines: string[] = [];
  const params: DocComment["params"] = [];
  let returns: string | null = null;
  const throws: string[] = [];
  const examples: string[] = [];

  let i = 0;
  // Collect description lines (before first @tag)
  while (i < lines.length && !lines[i].startsWith("@")) {
    descLines.push(lines[i]);
    i++;
  }

  // Parse @tags
  const tagBlock = lines.slice(i).join("\n");

  // @param
  const paramMatches = tagBlock.matchAll(new RegExp(PARAM_RE.source, "g"));
  for (const m of paramMatches) {
    params.push({
      type: m[1]?.trim() ?? "",
      name: m[2]?.trim() ?? "",
      description: m[3]?.trim() ?? "",
    });
  }

  // @returns
  const returnsMatch = tagBlock.match(RETURNS_RE);
  if (returnsMatch) returns = returnsMatch[1].trim();

  // @throws
  const throwsMatches = tagBlock.matchAll(new RegExp(THROWS_RE.source, "g"));
  for (const m of throwsMatches) {
    throws.push(m[1].trim());
  }

  // @example
  const exampleMatches = tagBlock.matchAll(new RegExp(EXAMPLE_RE.source, "g"));
  for (const m of exampleMatches) {
    examples.push(m[1].trim());
  }

  return {
    file,
    line,
    description: descLines.join("\n").trim(),
    params,
    returns,
    throws,
    examples,
    symbol,
  };
}

/**
 * Extracts all JSDoc comments from a TypeScript source file.
 */
export function extractDocComments(filePath: string, rootDir: string): DocComment[] {
  const source = readFileSync(filePath, "utf-8");
  const relPath = relative(rootDir, filePath);
  const results: DocComment[] = [];

  let match: RegExpExecArray | null;
  JSDOC_BLOCK_RE.lastIndex = 0;

  while ((match = JSDOC_BLOCK_RE.exec(source)) !== null) {
    const commentStart = match.index;
    const commentEnd = JSDOC_BLOCK_RE.lastIndex;

    // Count lines up to comment start
    const lineNumber = source.slice(0, commentStart).split("\n").length;

    // Find the symbol name on the line immediately after the comment
    const afterComment = source.slice(commentEnd).trimStart();
    const symbolMatch = afterComment.match(
      /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/
    );
    const symbol = symbolMatch ? symbolMatch[1] : null;

    results.push(parseJsdocBlock(match[1], relPath, lineNumber, symbol));
  }

  return results;
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

/**
 * Recursively collects all .ts files under a directory, excluding test files
 * and node_modules.
 */
export function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(current: string) {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (
        extname(entry) === ".ts" &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".spec.ts") &&
        !entry.endsWith(".d.ts")
      ) {
        files.push(full);
      }
    }
  }

  walk(dir);
  return files;
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

/**
 * Renders a list of DocComments into a Markdown string.
 */
export function renderMarkdown(docs: DocComment[], title: string): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    `> Auto-generated from source code comments. Do not edit manually.`,
    `> Last updated: ${new Date().toISOString()}`,
    "",
  ];

  // Group by file
  const byFile = new Map<string, DocComment[]>();
  for (const doc of docs) {
    if (!doc.description && !doc.symbol) continue; // skip empty
    const arr = byFile.get(doc.file) ?? [];
    arr.push(doc);
    byFile.set(doc.file, arr);
  }

  for (const [file, fileDocs] of byFile) {
    lines.push(`## \`${file}\``, "");

    for (const doc of fileDocs) {
      const heading = doc.symbol ? `### \`${doc.symbol}\`` : "### (anonymous)";
      lines.push(heading, "");

      if (doc.description) {
        lines.push(doc.description, "");
      }

      if (doc.params.length > 0) {
        lines.push("**Parameters:**", "");
        lines.push("| Name | Type | Description |");
        lines.push("| ---- | ---- | ----------- |");
        for (const p of doc.params) {
          lines.push(`| \`${p.name}\` | \`${p.type || "any"}\` | ${p.description} |`);
        }
        lines.push("");
      }

      if (doc.returns) {
        lines.push(`**Returns:** ${doc.returns}`, "");
      }

      if (doc.throws.length > 0) {
        lines.push("**Throws:**", "");
        for (const t of doc.throws) {
          lines.push(`- ${t}`);
        }
        lines.push("");
      }

      if (doc.examples.length > 0) {
        lines.push("**Example:**", "");
        for (const ex of doc.examples) {
          lines.push("```typescript", ex, "```", "");
        }
      }

      lines.push(`*Defined in \`${doc.file}:${doc.line}\`*`, "", "---", "");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith("generate-docs.ts")) {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf("--src");
  const outIdx = args.indexOf("--out");

  const srcDir = srcIdx !== -1 ? args[srcIdx + 1] : "src";
  const outFile = outIdx !== -1 ? args[outIdx + 1] : "docs/API.md";

  const rootDir = process.cwd();
  const absoluteSrc = join(rootDir, srcDir);

  console.log(`Scanning ${absoluteSrc} for JSDoc comments...`);
  const files = collectSourceFiles(absoluteSrc);
  console.log(`Found ${files.length} source files`);

  const allDocs: DocComment[] = [];
  for (const f of files) {
    allDocs.push(...extractDocComments(f, rootDir));
  }

  console.log(`Extracted ${allDocs.length} documentation blocks`);

  const markdown = renderMarkdown(allDocs, "Nova Launch API Documentation");

  // Ensure output directory exists
  const outDir = outFile.split("/").slice(0, -1).join("/");
  if (outDir) mkdirSync(join(rootDir, outDir), { recursive: true });

  writeFileSync(join(rootDir, outFile), markdown, "utf-8");
  console.log(`Documentation written to ${outFile}`);
}

/**
 * Mounts the GraphQL endpoint on an Express router.
 *
 * Endpoint: POST /api/graphql
 *
 * Uses `graphql-http` (spec-compliant, no Apollo overhead).
 * Introspection is disabled in production to reduce attack surface.
 *
 * Security:
 *  - Depth limit: rejects queries nested deeper than MAX_DEPTH (6)
 *  - No mutations exposed — all writes go through the existing REST layer
 *  - Rate limiting is inherited from the global Express rate limiter in index.ts
 */

import { Router } from "express";
import { createHandler } from "graphql-http/lib/use/express";
import { buildSchema, GraphQLError, parse, validate } from "graphql";
import { typeDefs } from "./schema";
import { resolvers } from "./resolvers";

const MAX_DEPTH = 6;

function maxQueryDepth(node: any, depth = 0): number {
  if (!node || typeof node !== "object") return depth;
  if (node.selectionSet?.selections) {
    return Math.max(
      ...node.selectionSet.selections.map((s: any) => maxQueryDepth(s, depth + 1))
    );
  }
  return depth;
}

export const schema = buildSchema(typeDefs);

/** Flat rootValue merging all resolver namespaces for graphql-http. */
const rootValue = {
  ...resolvers.Query,
  // Field resolvers for nested types are handled inside the Query resolvers
  // by fetching relations lazily (see resolvers.ts Token.burnRecords etc.)
};

const router = Router();

router.all(
  "/",
  createHandler({
    schema,
    rootValue,
    onSubscribe(_req, params) {
      // Disable introspection in production
      if (
        process.env.NODE_ENV === "production" &&
        typeof params.query === "string" &&
        params.query.includes("__schema")
      ) {
        return [new GraphQLError("Introspection is disabled in production")];
      }

      if (typeof params.query === "string") {
        try {
          const doc = parse(params.query);
          const errors = validate(schema, doc);
          if (errors.length) return errors;

          const depth = Math.max(...doc.definitions.map((def: any) => maxQueryDepth(def)));
          if (depth > MAX_DEPTH) {
            return [new GraphQLError(`Query depth ${depth} exceeds maximum allowed depth of ${MAX_DEPTH}`)];
          }
        } catch {
          return [new GraphQLError("Failed to parse query")];
        }
      }

      return undefined;
    },
  })
);

export default router;

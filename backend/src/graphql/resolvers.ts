/**
 * GraphQL resolvers.
 *
 * All resolvers are read-only (Query only). BigInt values from Prisma are
 * converted to strings before returning so JSON serialisation is lossless.
 *
 * Pagination: `limit` is capped at 100; `offset` defaults to 0.
 */

import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_LIMIT = 100;

function paginate(args: { limit?: number | null; offset?: number | null }) {
  return {
    take: Math.min(args.limit ?? 20, MAX_LIMIT),
    skip: args.offset ?? 0,
  };
}

/** Recursively convert BigInt values to strings for JSON safety. */
function bigintToString<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString() as unknown as T;
  if (Array.isArray(obj)) return obj.map(bigintToString) as unknown as T;
  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, bigintToString(v)])
    ) as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

export const resolvers = {
  Query: {
    // ── Token ───────────────────────────────────────────────────────────────

    /** Fetch a single token by its on-chain address. */
    async token(_: unknown, args: { address: string }) {
      const row = await prisma.token.findUnique({ where: { address: args.address } });
      return row ? bigintToString(row) : null;
    },

    /** List tokens, optionally filtered by creator. */
    async tokens(_: unknown, args: { creator?: string; limit?: number; offset?: number }) {
      const rows = await prisma.token.findMany({
        where: args.creator ? { creator: args.creator } : undefined,
        orderBy: { createdAt: "desc" },
        ...paginate(args),
      });
      return bigintToString(rows);
    },

    // ── Stream ──────────────────────────────────────────────────────────────

    /** Fetch a single stream by its on-chain streamId. */
    async stream(_: unknown, args: { streamId: number }) {
      const row = await prisma.stream.findUnique({ where: { streamId: args.streamId } });
      return row ? bigintToString(row) : null;
    },

    /** List streams with optional creator / recipient / status filters. */
    async streams(
      _: unknown,
      args: { creator?: string; recipient?: string; status?: string; limit?: number; offset?: number }
    ) {
      const where: Record<string, unknown> = {};
      if (args.creator) where.creator = args.creator;
      if (args.recipient) where.recipient = args.recipient;
      if (args.status) where.status = args.status;

      const rows = await prisma.stream.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paginate(args),
      });
      return bigintToString(rows);
    },

    // ── Governance ──────────────────────────────────────────────────────────

    /** Fetch a single proposal by its on-chain proposalId. */
    async proposal(_: unknown, args: { proposalId: number }) {
      const row = await prisma.proposal.findUnique({ where: { proposalId: args.proposalId } });
      return row ? bigintToString(row) : null;
    },

    /** List proposals with optional filters. */
    async proposals(
      _: unknown,
      args: {
        tokenId?: string;
        proposer?: string;
        status?: string;
        proposalType?: string;
        limit?: number;
        offset?: number;
      }
    ) {
      const where: Record<string, unknown> = {};
      if (args.tokenId) where.tokenId = args.tokenId;
      if (args.proposer) where.proposer = args.proposer;
      if (args.status) where.status = args.status;
      if (args.proposalType) where.proposalType = args.proposalType;

      const rows = await prisma.proposal.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paginate(args),
      });
      return bigintToString(rows);
    },

    // ── Campaign ─────────────────────────────────────────────────────────────

    /** Fetch a single campaign by its on-chain campaignId. */
    async campaign(_: unknown, args: { campaignId: number }) {
      const row = await prisma.campaign.findUnique({ where: { campaignId: args.campaignId } });
      return row ? bigintToString(row) : null;
    },

    /** List campaigns with optional filters. */
    async campaigns(
      _: unknown,
      args: {
        tokenId?: string;
        creator?: string;
        status?: string;
        type?: string;
        limit?: number;
        offset?: number;
      }
    ) {
      const where: Record<string, unknown> = {};
      if (args.tokenId) where.tokenId = args.tokenId;
      if (args.creator) where.creator = args.creator;
      if (args.status) where.status = args.status;
      if (args.type) where.type = args.type;

      const rows = await prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paginate(args),
      });
      return bigintToString(rows);
    },
  },

  // ── Field resolvers (nested relations) ────────────────────────────────────

  Token: {
    /** Lazy-load burn records for a token. */
    async burnRecords(parent: { id: string }, args: { limit?: number; offset?: number }) {
      const rows = await prisma.burnRecord.findMany({
        where: { tokenId: parent.id },
        orderBy: { timestamp: "desc" },
        ...paginate(args),
      });
      return bigintToString(rows);
    },
  },

  Proposal: {
    /** Lazy-load votes for a proposal. */
    async votes(parent: { id: string }, args: { limit?: number; offset?: number }) {
      const rows = await prisma.vote.findMany({
        where: { proposalId: parent.id },
        orderBy: { timestamp: "desc" },
        ...paginate(args),
      });
      return bigintToString(rows);
    },
  },
};

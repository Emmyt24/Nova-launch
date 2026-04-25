import { Prisma } from "@prisma/client";
import type { ValidatedSearchTokensQuery } from "./schema";

export function buildTokenSearchQuery(params: ValidatedSearchTokensQuery) {
  const where: Prisma.TokenWhereInput = {};

  // Full-text search by name or symbol
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { symbol: { contains: params.q, mode: "insensitive" } },
    ];
  }

  // Filter by creator address
  if (params.creator) {
    where.creator = { equals: params.creator, mode: "insensitive" };
  }

  // Filter by creation date range
  if (params.startDate || params.endDate) {
    where.createdAt = {};
    if (params.startDate) {
      where.createdAt.gte = new Date(params.startDate);
    }
    if (params.endDate) {
      where.createdAt.lte = new Date(params.endDate);
    }
  }

  // Filter by supply range
  if (params.minSupply || params.maxSupply) {
    where.totalSupply = {};
    if (params.minSupply) {
      where.totalSupply.gte = BigInt(params.minSupply);
    }
    if (params.maxSupply) {
      where.totalSupply.lte = BigInt(params.maxSupply);
    }
  }

  // Filter by burn status
  if (params.hasBurns !== undefined) {
    if (params.hasBurns === "true") {
      where.burnCount = { gt: 0 };
    } else {
      where.burnCount = { equals: 0 };
    }
  }

  // Build orderBy
  const orderBy: Prisma.TokenOrderByWithRelationInput = {};

  switch (params.sortBy) {
    case "created":
      orderBy.createdAt = params.sortOrder;
      break;
    case "burned":
      orderBy.totalBurned = params.sortOrder;
      break;
    case "supply":
      orderBy.totalSupply = params.sortOrder;
      break;
    case "name":
      orderBy.name = params.sortOrder;
      break;
  }

  return { where, orderBy };
}

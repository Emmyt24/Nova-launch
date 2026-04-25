import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchTokensSchema, type SearchTokensQuery } from "./schema";
import { buildTokenSearchQuery } from "./query-builder";
import { cacheSearchResults, getCachedSearchResults } from "./cache";
import type { TokenSearchResponse, TokenSearchErrorResponse } from "./types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate query parameters
    const queryParams: SearchTokensQuery = {
      q: searchParams.get("q") || undefined,
      creator: searchParams.get("creator") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      minSupply: searchParams.get("minSupply") || undefined,
      maxSupply: searchParams.get("maxSupply") || undefined,
      hasBurns: searchParams.get("hasBurns") || undefined,
      sortBy: (searchParams.get("sortBy") as any) || "created",
      sortOrder: (searchParams.get("sortOrder") as any) || "desc",
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "20",
    };

    // Validate with Zod
    const validation = searchTokensSchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const validatedParams = validation.data;

    // Check cache
    const cacheKey = JSON.stringify(validatedParams);
    const cached = await getCachedSearchResults(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Build query
    const { where, orderBy } = buildTokenSearchQuery(validatedParams);

    // Calculate pagination
    const page = parseInt(validatedParams.page);
    const limit = parseInt(validatedParams.limit);
    const skip = (page - 1) * limit;

    // Execute queries in parallel
    const [tokens, total] = await Promise.all([
      prisma.token.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          address: true,
          creator: true,
          name: true,
          symbol: true,
          decimals: true,
          totalSupply: true,
          initialSupply: true,
          totalBurned: true,
          burnCount: true,
          metadataUri: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.token.count({ where }),
    ]);

    // Format response
    const response: TokenSearchResponse = {
      success: true,
      data: tokens.map((token): any => ({
        ...token,
        totalSupply: token.totalSupply.toString(),
        initialSupply: token.initialSupply.toString(),
        totalBurned: token.totalBurned.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      filters: {
        q: validatedParams.q,
        creator: validatedParams.creator,
        startDate: validatedParams.startDate,
        endDate: validatedParams.endDate,
        minSupply: validatedParams.minSupply,
        maxSupply: validatedParams.maxSupply,
        hasBurns: validatedParams.hasBurns,
        sortBy: validatedParams.sortBy,
        sortOrder: validatedParams.sortOrder,
      },
    };

    // Cache the results
    await cacheSearchResults(cacheKey, response);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Token search error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

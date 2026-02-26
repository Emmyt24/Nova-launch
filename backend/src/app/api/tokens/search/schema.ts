import { z } from "zod";

export const searchTokensSchema = z.object({
  // Full-text search
  q: z.string().optional(),

  // Filters
  creator: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minSupply: z.string().regex(/^\d+$/).optional(),
  maxSupply: z.string().regex(/^\d+$/).optional(),
  hasBurns: z.enum(["true", "false"]).optional(),

  // Sorting
  sortBy: z.enum(["created", "burned", "supply", "name"]).default("created"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),

  // Pagination
  page: z.string().regex(/^\d+$/).default("1"),
  limit: z
    .string()
    .regex(/^\d+$/)
    .default("20")
    .refine((val) => parseInt(val) <= 50, {
      message: "Limit cannot exceed 50",
    }),
});

export type SearchTokensQuery = z.input<typeof searchTokensSchema>;
export type ValidatedSearchTokensQuery = z.output<typeof searchTokensSchema>;

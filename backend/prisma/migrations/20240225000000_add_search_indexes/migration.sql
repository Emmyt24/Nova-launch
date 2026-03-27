-- Add indexes for token search optimization

-- Index for full-text search on name (case-insensitive)
CREATE INDEX IF NOT EXISTS "Token_name_idx" ON "Token" USING gin (to_tsvector('english', "name"));

-- Index for full-text search on symbol (case-insensitive)
CREATE INDEX IF NOT EXISTS "Token_symbol_idx" ON "Token" USING gin (to_tsvector('english', "symbol"));

-- Composite index for date range queries with sorting
CREATE INDEX IF NOT EXISTS "Token_createdAt_totalBurned_idx" ON "Token" ("createdAt" DESC, "totalBurned" DESC);

-- Composite index for supply range queries
CREATE INDEX IF NOT EXISTS "Token_totalSupply_createdAt_idx" ON "Token" ("totalSupply" DESC, "createdAt" DESC);

-- Index for burn count filtering
CREATE INDEX IF NOT EXISTS "Token_burnCount_idx" ON "Token" ("burnCount");

-- Composite index for creator + date queries
CREATE INDEX IF NOT EXISTS "Token_creator_createdAt_idx" ON "Token" ("creator", "createdAt" DESC);

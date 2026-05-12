-- Sub-500ms autocomplete: pg_trgm + denormalized search column + precomputed
-- availability flag. Replaces the ILIKE+join hot path with an indexed lookup.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Denormalized, lowercased search blob: brand + name + salt.
ALTER TABLE "Medicine" ADD COLUMN "searchText" text
  GENERATED ALWAYS AS (
    lower(
      coalesce("brandName",'') || ' ' ||
      coalesce("name",'')       || ' ' ||
      coalesce("saltComposition",'')
    )
  ) STORED;

-- Prefix-optimised index for `LIKE 'foo%'` (text_pattern_ops bypasses the
-- default collation so LIKE can actually use it).
CREATE INDEX "Medicine_searchText_prefix_idx"
  ON "Medicine" ("searchText" text_pattern_ops);

-- Trigram index for substring + fuzzy fallback ("650", "advance", etc.).
CREATE INDEX "Medicine_searchText_trgm_idx"
  ON "Medicine" USING gin ("searchText" gin_trgm_ops);

-- Precomputed availability flag, set by the scrape worker on each upsert.
-- Eliminates the `listings: { some: { inStock: true } }` correlated subquery.
-- Default true so brand-new catalog rows are still surfaced before they get
-- their first scrape.
ALTER TABLE "Medicine"
  ADD COLUMN "hasInStock" boolean NOT NULL DEFAULT true;

CREATE INDEX "Medicine_hasInStock_idx" ON "Medicine" ("hasInStock");

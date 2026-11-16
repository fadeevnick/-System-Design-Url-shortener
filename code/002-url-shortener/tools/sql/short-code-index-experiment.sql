-- Inspect the indexes before each experiment.
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'urls'
ORDER BY indexname;

-- IMPORTANT:
-- `short_code TEXT UNIQUE` creates a unique index automatically.
-- Dropping only urls_short_code_idx is NOT a no-index experiment.

-- NO-INDEX state for the read-only benchmark:
-- 1. Drop the explicitly created redundant index outside a transaction.
--    Run separately in psql:
--      DROP INDEX CONCURRENTLY IF EXISTS urls_short_code_idx;
--
-- 2. Drop the UNIQUE constraint, which also removes its unique index.
--    Run this only while the application is used for read-only testing.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute attr
    ON attr.attrelid = con.conrelid
   AND attr.attnum = ANY (con.conkey)
  WHERE rel.relname = 'urls'
    AND con.contype = 'u'
    AND attr.attname = 'short_code'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE urls DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

ANALYZE urls;

-- RESTORE state after the benchmark:
-- Run outside a transaction where CONCURRENTLY is used:
--   CREATE UNIQUE INDEX CONCURRENTLY urls_short_code_key
--     ON urls (short_code);
--   ALTER TABLE urls ADD CONSTRAINT urls_short_code_key
--     UNIQUE USING INDEX urls_short_code_key;
--   CREATE INDEX CONCURRENTLY urls_short_code_idx ON urls (short_code);

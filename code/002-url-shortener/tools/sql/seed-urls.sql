-- Seed the urls table up to 1 million rows.
-- Run with psql against the same database used by the application:
--   psql "$DATABASE_URL" -f tools/sql/seed-urls.sql
--
-- The script is idempotent with respect to the target row count: rerunning it
-- only inserts the missing rows.

\set ON_ERROR_STOP on
\set target_rows 1000000

SELECT GREATEST(:'target_rows'::bigint - count(*), 0) AS rows_to_insert
FROM urls
\gset

\echo Seeding :rows_to_insert rows to reach :target_rows total rows

WITH generated AS MATERIALIZED (
  SELECT nextval(pg_get_serial_sequence('urls', 'id')) AS id
  FROM generate_series(1, :rows_to_insert)
)
INSERT INTO urls (id, short_code, long_url)
SELECT
  id,
  'bulk_' || lpad(id::text, 14, '0'),
  'https://bulk.example.com/item/' || id::text
FROM generated;

ANALYZE urls;

SELECT
  count(*) AS total_rows,
  pg_size_pretty(pg_total_relation_size('urls')) AS total_relation_size
FROM urls;

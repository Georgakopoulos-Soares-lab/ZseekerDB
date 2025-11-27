-- Χρησιμοποίησε το μέσα από DuckDB CLI με:
-- .open "C:/zdna/zdnadatabase.duckdb"
-- .read "C:/zdna/scripts/define_views_no_parquet.sql"

-- 1) Δημιουργία/επαν-δημιουργία του view 'zdna' πάνω στο table 'data'
CREATE OR REPLACE VIEW zdna AS
SELECT "Chromosome", "Start", "End", "Z-DNA Score", "Sequence"
FROM data;

-- 2) (Προαιρετικό) Ένα απλό view που δείχνει στο υπάρχον table 'metadata'
--    Δεν είναι απαραίτητο για το backend, αλλά βοηθά σε ομοιομορφία.
CREATE OR REPLACE VIEW metadata_view AS
SELECT * FROM metadata WHERE genome_size >= 1000;

-- 3) Γρήγορο sanity check
-- SELECT COUNT(*) AS n_data FROM data;
-- SELECT COUNT(*) AS n_meta FROM metadata;
-- SELECT * FROM zdna LIMIT 1;

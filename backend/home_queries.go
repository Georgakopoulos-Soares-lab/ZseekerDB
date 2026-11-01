package main

const homeKPIsQuery = `
WITH per_species AS (
 SELECT species_taxid, AVG(genome_size) AS gs, AVG(gc_percent) AS gc
 FROM metadata_all WHERE species_taxid IS NOT NULL AND species_taxid > 0
 GROUP BY species_taxid
)
SELECT (SELECT COUNT(*) FROM metadata_all), COUNT(*), AVG(gs), AVG(gc),
       (SELECT total_sites FROM data_kpis LIMIT 1)
FROM per_species`

const homeSuperkingdomsQuery = `
SELECT COALESCE(superkingdom,'(unknown)') AS label, COUNT(*) AS n
FROM metadata_all GROUP BY 1 ORDER BY n DESC`

const homeTopKingdomsQuery = `
SELECT kingdom AS label, AVG(density) AS density, SUM(n)::BIGINT AS cnt,
       superkingdom
FROM (
 SELECT kingdom, COALESCE(superkingdom,'(unknown)') AS superkingdom,
        species_taxid, AVG(obs_density_per_kb) AS density, COUNT(*) AS n
 FROM metadata_all
 WHERE kingdom IS NOT NULL AND kingdom <> ''
   AND LOWER(kingdom) NOT LIKE '%unclassified%'
   AND species_taxid IS NOT NULL AND species_taxid > 0
   AND obs_density_per_kb IS NOT NULL
 GROUP BY kingdom, superkingdom, species_taxid
) per_species
GROUP BY kingdom, superkingdom
ORDER BY density DESC, kingdom LIMIT 10`

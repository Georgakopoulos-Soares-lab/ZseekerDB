"""Build complete assembly metadata and the prediction-bearing browser subset.

Does not scan or rewrite the prediction table. Supports both supplied TSV naming
schemes; missing required fields or duplicate accessions fail before replacement.
"""
from pathlib import Path


def build_metadata(con, tsv, drop_empty=True):
    path = str(Path(tsv).resolve()).replace("'", "''")
    con.execute(f"CREATE OR REPLACE TEMP VIEW _release_source AS SELECT * FROM read_csv('{path}', delim='\t', header=true, all_varchar=true)")
    cols = {r[0] for r in con.execute('DESCRIBE _release_source').fetchall()}

    def column(*names):
        for name in names:
            if name in cols:
                return 'm."' + name.replace('"', '""') + '"'
        raise ValueError(f"Metadata missing required field: {' or '.join(names)}")

    def text(*names):
        return f"NULLIF({column(*names)}, '')"

    def number(kind, *names):
        return f"TRY_CAST({text(*names)} AS {kind})"

    mappings = {
        'assembly': text('assembly'),
        'bioproject': "CAST(NULL AS VARCHAR)",
        'biosample': "CAST(NULL AS VARCHAR)",
        'taxid': number('BIGINT', 'ncbi_summary_taxid', 'ncbi_taxid'),
        'assembly_level': f"CASE lower({text('resolve_level')}) WHEN 'complete' THEN 'Complete Genome' WHEN 'chromosome' THEN 'Chromosome' ELSE {text('resolve_level')} END",
        'genome_size': number('BIGINT', 'genome_size'),
        'gc_percent': number('DOUBLE', 'gc_percent'),
        **{name: text(name) for name in ['superkingdom', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'tax_name']},
        'is_t2t': 'COALESCE(z.is_t2t, ' + ('TRY_CAST(m.is_t2t AS BOOLEAN), ' if 'is_t2t' in cols else '') + 'false)',
        'viral_realm': text('viral_realm'),
        'updated_tax_name': text('updated_tax_name'),
        'obs_zbp': number('BIGINT', 'Z-DNA/-RNA bases count'),
        'obs_density_per_kb': number('DOUBLE', 'Z-DNA/-RNA density per kb'),
        'obs_n_zdna': number('BIGINT', 'Z-DNA/-RNA predictions count'),
        'species_taxid': number('BIGINT', 'ncbi_summary_species_taxid', 'ncbi_species_taxid'),
    }
    n, distinct, missing = con.execute('SELECT COUNT(*), COUNT(DISTINCT assembly), COUNT(*) FILTER (WHERE assembly IS NULL OR trim(assembly)=\'\') FROM _release_source').fetchone()
    if not n or distinct != n or missing:
        raise ValueError(f"Metadata must have one nonempty accession per row: rows={n}, distinct={distinct}, missing={missing}")
    has_map = con.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name='_asm_t2t'").fetchone()[0]
    if not has_map:
        con.execute('CREATE TEMP TABLE _asm_t2t (assembly VARCHAR, is_t2t BOOLEAN)')
        # A metadata-only refresh retains known filename-derived T2T flags.
        has_metadata = con.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name='metadata'").fetchone()[0]
        if has_metadata:
            con.execute('INSERT INTO _asm_t2t SELECT assembly, is_t2t FROM metadata')
    projection = ',\n'.join(f'{value} AS "{key}"' for key, value in mappings.items())
    con.execute('BEGIN')
    try:
        con.execute(f'CREATE OR REPLACE TABLE metadata_all AS SELECT {projection} FROM _release_source m LEFT JOIN _asm_t2t z ON z.assembly=m.assembly')
        con.execute('CREATE OR REPLACE TABLE metadata AS SELECT * EXCLUDE (species_taxid) FROM metadata_all' + (' WHERE obs_n_zdna > 0' if drop_empty else ''))
        con.execute('COMMIT')
    except Exception:
        con.execute('ROLLBACK')
        raise
    return n


def recompute_observed(con, drop_empty=True):
    """Replace stale TSV prediction summaries using the validated prediction table.

    This scans data once. Genome-size attributes are unchanged; density uses
    the documented genome_size denominator, in bp, rather than fitting a target.
    """
    con.execute('CREATE OR REPLACE TEMP TABLE _observed AS SELECT assembly, COUNT(*)::BIGINT AS n, SUM(length("Sequence"))::BIGINT AS zbp, SUM("Z-DNA Score") AS score_sum, MIN("Z-DNA Score") AS score_min, MAX("Z-DNA Score") AS score_max FROM data GROUP BY assembly')
    missing = con.execute('SELECT COUNT(*) FROM _observed o LEFT JOIN metadata_all m USING (assembly) WHERE m.assembly IS NULL').fetchone()[0]
    if missing:
        raise ValueError(f'{missing} prediction-bearing assemblies lack metadata')
    con.execute('BEGIN')
    try:
        con.execute('''CREATE OR REPLACE TABLE metadata_all AS
          SELECT m.* EXCLUDE (obs_zbp, obs_density_per_kb, obs_n_zdna),
                 COALESCE(o.zbp, 0)::BIGINT AS obs_zbp,
                 CASE WHEN m.genome_size > 0 THEN COALESCE(o.zbp, 0)::DOUBLE * 1000 / m.genome_size ELSE NULL END AS obs_density_per_kb,
                 COALESCE(o.n, 0)::BIGINT AS obs_n_zdna
          FROM metadata_all m LEFT JOIN _observed o USING (assembly)''')
        # Restore the canonical field order after replacing the summary values.
        con.execute('CREATE OR REPLACE TABLE metadata_all AS SELECT * EXCLUDE (species_taxid), species_taxid FROM metadata_all')
        con.execute('CREATE OR REPLACE TABLE metadata AS SELECT * EXCLUDE (species_taxid) FROM metadata_all' + (' WHERE obs_n_zdna > 0' if drop_empty else ''))
        con.execute('COMMIT')
    except Exception:
        con.execute('ROLLBACK')
        raise


def main():
    import os
    from common import connect, META_TSV
    con = connect()
    try:
        print(f"metadata_all: {build_metadata(con, META_TSV, os.environ.get('MIG_DROP_EMPTY_ASSEMBLIES', '1') == '1'):,} assemblies")
        if os.environ.get('MIG_RECOMPUTE_OBSERVED', '0') == '1':
            recompute_observed(con, os.environ.get('MIG_DROP_EMPTY_ASSEMBLIES', '1') == '1')
    finally:
        con.close()


if __name__ == '__main__':
    main()

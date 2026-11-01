"""Export the actual queryable schema, units, definitions and example values."""
import argparse
import csv
import duckdb

PUBLIC=['data','zdna','metadata','metadata_all','metadata_view','chromosomes','tax_names','data_kpis','data_top_asm','data_top_chrom']
ALIASES={'Assembly':'assembly','T2T':'is_t2t','Genome size':'genome_size','Taxon ID':'taxid','GC content (%)':'gc_percent','Viral realm':'viral_realm','Infraspecific name':'updated_tax_name','Z-DNA bps':'obs_zbp','Z-DNA density (per kb)':'obs_density_per_kb','Number of predicrions':'obs_n_zdna'}
DEFINITIONS={
 'Chromosome':('identifier','Native source sequence accession; human display/export aliases are assembly-scoped'),
 'Start':('bp','Zero-based inclusive start; BED retains this value'),
 'End':('bp','Zero-based inclusive end; BED uses End + 1 as its exclusive end'),
 'Z-DNA Score':('dimensionless','Original ZSeeker sequence score'),
 'Sequence':('nucleotides','Predicted sequence; length equals End - Start + 1'),
 'assembly':('identifier','Versioned genome assembly accession; join key'),
 'bioproject':('identifier','Compatibility field; NULL when not supplied in input metadata'),
 'biosample':('identifier','Compatibility field; NULL when not supplied in input metadata'),
 'taxid':('NCBI taxid','Assembly/strain taxid from ncbi_taxid or ncbi_summary_taxid'),
 'species_taxid':('NCBI taxid','Species grouping ID from ncbi_species_taxid or ncbi_summary_species_taxid'),
 'assembly_level':('category','Input resolve_level, normalized to Complete Genome or Chromosome'),
 'genome_size':('bp','Reported genome_size from the supplied assembly attributes'),
 'gc_percent':('%','Reported genomic GC percentage from the supplied assembly attributes'),
 'is_t2t':('boolean','Filename-derived T2T marker; not independent completeness validation'),
 'updated_tax_name':('label','Updated input taxon label; the legacy view calls this Infraspecific name'),
 'viral_realm':('label','Viral-realm annotation retained from the supplied metadata'),
 'obs_zbp':('bp','Sum of actual retained locus sequence lengths'),
 'obs_density_per_kb':('bp/kb','obs_zbp * 1000 / genome_size; NULL for unavailable or nonpositive genome size'),
 'obs_n_zdna':('loci','Actual retained prediction count, including zero for assemblies without loci'),
 'total_sites':('loci','Total retained prediction count'),
 'distinct_chr':('count','Number of distinct native chromosome/sequence accessions'),
 'avg_score':('dimensionless','Mean score across retained loci'),
 'min_score':('dimensionless','Minimum retained locus score'),
 'max_score':('dimensionless','Maximum retained locus score'),
 'avg_seq_len':('bp','Mean retained locus sequence length'),
 'distinct_asm':('count','Number of assemblies with at least one retained locus'),
 'computed_at':('timestamp with time zone','Time at which prediction summaries were computed'),
 'c':('loci','Prediction count for the assembly or chromosome key'),
 'tax_name':('label','Taxon name retained from source metadata'),
}


def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('database');ap.add_argument('output');args=ap.parse_args()
 con=duckdb.connect(args.database,read_only=True)
 with open(args.output,'w') as out:
  writer=csv.writer(out,delimiter='\t');writer.writerow(['object','field','duckdb_type','units','definition','example'])
  for table in PUBLIC:
   schema=con.execute(f'DESCRIBE "{table}"').fetchall();row=con.execute(f'SELECT * FROM "{table}" LIMIT 1').fetchone()
   for i,field in enumerate(schema):
    name=field[0];key=ALIASES.get(name,name)
    if key=='k':definition=('identifier','Assembly accession' if table=='data_top_asm' else 'Native chromosome/sequence accession')
    else:definition=DEFINITIONS.get(key,('label',f'{key} taxonomic annotation retained from source metadata'))
    example='NULL' if row is None or row[i] is None else str(row[i])
    if len(example)>120:example=example[:120]+' [truncated]'
    writer.writerow([table,name,field[1],*definition,example])
 print('Schema exported for',len(PUBLIC),'queryable objects')


if __name__=='__main__':main()

// Species browser columns. Labels must match metadataColumns in backend/main.go: the
// list API returns columns by label and the page resolves them back to database names.
export type MetadataColumn = {
  dbName: string;
  label: string;
  hidden: boolean;
};

// Column definitions in display order
export const METADATA_COLUMNS: MetadataColumn[] = [
  { dbName: "assembly", label: "Assembly", hidden: false },
  { dbName: "tax_name", label: "Species", hidden: false },
  { dbName: "viral_realm", label: "Viral realm", hidden: false },
  { dbName: "kingdom", label: "Kingdom", hidden: false },
  { dbName: "phylum", label: "Phylum", hidden: false },
  { dbName: "class", label: "Class", hidden: false },
  { dbName: "order", label: "Order", hidden: false },
  { dbName: "family", label: "Family", hidden: false },
  { dbName: "genus", label: "Genus", hidden: false },
  { dbName: "taxid", label: "Taxon ID", hidden: true },
  { dbName: "assembly_level", label: "Assembly level", hidden: true },
  { dbName: "genome_size_manual", label: "Genome size", hidden: true },
  { dbName: "gc_percent", label: "%GC", hidden: true },
  { dbName: "superkingdom", label: "Superkingdom", hidden: true },
  { dbName: "updated_tax_name", label: "Full organism name", hidden: true },
  { dbName: "infraspecific_name", label: "Infraspecific name", hidden: true },
  { dbName: "species_taxid", label: "Species taxon ID", hidden: true },
  { dbName: "genome_size_ungapped", label: "Genome size (ungapped)", hidden: true },
  { dbName: "replicon_count", label: "Replicons", hidden: true },
  { dbName: "scaffold_count", label: "Scaffolds", hidden: true },
  { dbName: "contig_count", label: "Contigs", hidden: true },
  { dbName: "reference_genome", label: "Reference genome", hidden: true },
  { dbName: "obs_zbp", label: "Z-DNA bases count", hidden: true },
  { dbName: "obs_density_per_kb", label: "Z-DNA density per kb", hidden: true },
  { dbName: "obs_n_zdna", label: "Z-DNA predictions count", hidden: true },
];


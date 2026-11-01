export const HUMAN_ASSEMBLY = 'GCF_009914755.1';

const labels = [...Array.from({ length: 22 }, (_, i) => String(i + 1)), 'X', 'Y'];
const accessions = labels.map((_, i) => `NC_${String(60925 + i).padStart(6, '0')}.1`);
const display = new Map(accessions.map((a, i) => [a, labels[i]]));
const source = new Map(labels.map((label, i) => [label, accessions[i]]));

export function toDisplay(chromosome: string, assembly?: string | null): string {
  return assembly === HUMAN_ASSEMBLY ? display.get(chromosome) ?? chromosome : chromosome;
}

export function toAccession(chromosome: string, assembly?: string | null): string {
  return assembly === HUMAN_ASSEMBLY ? source.get(chromosome) ?? chromosome : chromosome;
}

export function chromosomeSort(a: string, b: string): number {
  const rank = (s: string) => labels.indexOf(s);
  const ar = rank(a), br = rank(b);
  if (ar >= 0 && br >= 0) return ar - br;
  if (ar >= 0) return -1;
  if (br >= 0) return 1;
  return a.localeCompare(b, undefined, { numeric: true });
}

// Species searches can span multiple assemblies. Restrict the alias branch to
// the human accession even when there is no single locked assembly.
export function chromosomeWhere(chromosome: string, assembly?: string | null): string {
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const accession = toAccession(chromosome, HUMAN_ASSEMBLY);
  if (assembly) return `"Chromosome" = ${quote(toAccession(chromosome, assembly))}`;
  if (accession === chromosome) return `"Chromosome" = ${quote(chromosome)}`;
  return `("Chromosome" = ${quote(chromosome)} OR (assembly = ${quote(HUMAN_ASSEMBLY)} AND "Chromosome" = ${quote(accession)}))`;
}

export function chromosomePrefixWhere(prefix: string): string {
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const aliases = labels.filter(label => label.toLowerCase().startsWith(prefix.toLowerCase()));
  const raw = `lower("Chromosome") LIKE ${quote(prefix.toLowerCase() + '%')}`;
  if (!aliases.length) return raw;
  return `(${raw} OR (assembly = ${quote(HUMAN_ASSEMBLY)} AND "Chromosome" IN (${aliases.map(label => quote(toAccession(label, HUMAN_ASSEMBLY))).join(',')})))`;
}

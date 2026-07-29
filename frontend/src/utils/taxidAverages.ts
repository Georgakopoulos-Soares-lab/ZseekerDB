export type TaxidBalancedGroupMean = {
  group: string;
  mean: number;
  assemblyCount: number;
  uniqueTaxids: number;
};

type TaxidAverageColumns = {
  groupColumn: string;
  taxidColumn: string;
  valueColumn: string;
};

/**
 * Gives every taxid one vote in a group mean, regardless of how many
 * assemblies belonging to that taxid are present in the input.
 */
export function taxidBalancedGroupMeans(
  rows: Record<string, unknown>[],
  columns: TaxidAverageColumns
): TaxidBalancedGroupMean[] {
  const byGroup = new Map<string, Map<string, { sum: number; assemblies: number }>>();

  for (const row of rows) {
    const group = String(row[columns.groupColumn] ?? '').trim() || '(unknown)';
    const taxid = String(row[columns.taxidColumn] ?? '').trim();
    const value = Number(row[columns.valueColumn]);
    if (!taxid || !Number.isFinite(value)) continue;

    const byTaxid = byGroup.get(group) ?? new Map();
    const taxon = byTaxid.get(taxid) ?? { sum: 0, assemblies: 0 };
    taxon.sum += value;
    taxon.assemblies += 1;
    byTaxid.set(taxid, taxon);
    byGroup.set(group, byTaxid);
  }

  return Array.from(byGroup.entries()).map(([group, byTaxid]) => {
    const taxa = Array.from(byTaxid.values());
    const taxidMeanSum = taxa.reduce(
      (sum, taxon) => sum + taxon.sum / taxon.assemblies,
      0
    );
    return {
      group,
      mean: taxidMeanSum / taxa.length,
      assemblyCount: taxa.reduce((sum, taxon) => sum + taxon.assemblies, 0),
      uniqueTaxids: taxa.length,
    };
  });
}

export type TaxonomicRank =
  | 'Superkingdom'
  | 'Viral realm'
  | 'Kingdom'
  | 'Phylum'
  | 'Class'
  | 'Order'
  | 'Family'
  | 'Genus'
  | 'Species';

export type TaxonomyTreeRow = {
  superkingdom: string | null;
  viral_realm: string | null;
  kingdom: string | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
  family: string | null;
  genus: string | null;
  tax_name: string | null;
  taxid: string | number | null;
  assembly_count: number;
};

export type TreeNode = {
  name: string;
  rank: TaxonomicRank;
  value: number;
  assemblyCount: number;
  uniqueTaxids: number;
  children?: TreeNode[];
  itemStyle?: { color?: string };
};

type MutableTreeNode = {
  name: string;
  rank: TaxonomicRank;
  assemblyCount: number;
  taxids: Set<string>;
  children: Map<string, MutableTreeNode>;
};

const normalize = (value: string | null, rank: TaxonomicRank) => {
  const text = (value ?? '').trim();
  return text || `Unclassified ${rank.toLowerCase()}`;
};

function lineage(row: TaxonomyTreeRow) {
  const superkingdom = normalize(row.superkingdom, 'Superkingdom');
  const path: { name: string; rank: TaxonomicRank }[] = [
    { name: superkingdom, rank: 'Superkingdom' },
  ];

  if (superkingdom.toLowerCase() === 'viruses') {
    path.push({ name: normalize(row.viral_realm, 'Viral realm'), rank: 'Viral realm' });
  }

  path.push(
    { name: normalize(row.kingdom, 'Kingdom'), rank: 'Kingdom' },
    { name: normalize(row.phylum, 'Phylum'), rank: 'Phylum' },
    { name: normalize(row.class, 'Class'), rank: 'Class' },
    { name: normalize(row.order, 'Order'), rank: 'Order' },
    { name: normalize(row.family, 'Family'), rank: 'Family' },
    { name: normalize(row.genus, 'Genus'), rank: 'Genus' },
    { name: normalize(row.tax_name, 'Species'), rank: 'Species' }
  );
  return path;
}

function finishNode(node: MutableTreeNode, topN: number): TreeNode {
  const allChildren = Array.from(node.children.values())
    .sort((a, b) => b.assemblyCount - a.assemblyCount || a.name.localeCompare(b.name));
  const children = allChildren.slice(0, topN).map(child => finishNode(child, topN));
  const value = children.length
    ? children.reduce((sum, child) => sum + child.value, 0)
    : Math.max(0.01, Math.log10(node.assemblyCount + 1));

  return {
    name: node.name,
    rank: node.rank,
    value,
    assemblyCount: node.assemblyCount,
    uniqueTaxids: node.taxids.size,
    ...(children.length ? { children } : {}),
  };
}

/**
 * Builds an explicit rank-by-rank hierarchy. Missing ranks become named
 * "Unclassified …" nodes, so a species is never silently attached to a
 * distant ancestor.
 */
export function buildTaxonomyTree(rows: TaxonomyTreeRow[], topN = 30): TreeNode[] {
  const roots = new Map<string, MutableTreeNode>();

  for (const row of rows) {
    const assemblyCount = Number(row.assembly_count);
    if (!Number.isFinite(assemblyCount) || assemblyCount <= 0) continue;
    const taxid = String(row.taxid ?? '').trim();
    let siblings = roots;

    for (const part of lineage(row)) {
      const key = `${part.rank}\u0000${part.name}`;
      let node = siblings.get(key);
      if (!node) {
        node = {
          name: part.name,
          rank: part.rank,
          assemblyCount: 0,
          taxids: new Set(),
          children: new Map(),
        };
        siblings.set(key, node);
      }
      node.assemblyCount += assemblyCount;
      if (taxid) node.taxids.add(taxid);
      siblings = node.children;
    }
  }

  return Array.from(roots.values())
    .sort((a, b) => b.assemblyCount - a.assemblyCount || a.name.localeCompare(b.name))
    .map(node => finishNode(node, topN));
}

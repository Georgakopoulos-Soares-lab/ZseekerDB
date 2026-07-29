import assert from 'node:assert/strict';
import test from 'node:test';

import { taxidBalancedGroupMeans } from '../src/utils/taxidAverages.ts';
import {
  buildTaxonomyTree,
  type TaxonomyTreeRow,
  type TreeNode,
} from '../src/utils/taxonomyTree.ts';
import {
  VIZ_FONT,
  VIZ_MUI_FONT,
} from '../src/utils/visualizationTypography.ts';
import {
  APP_FONT_SCALE,
  MUI_BASE_FONT_SIZE,
} from '../src/utils/typographyScale.ts';

test('taxid-balanced means give multiple assemblies from one taxid one vote', () => {
  const rows = [
    { genus: 'Example', taxid: 'A', density: 0 },
    { genus: 'Example', taxid: 'A', density: 10 },
    { genus: 'Example', taxid: 'B', density: 15 },
  ];
  const columns = {
    groupColumn: 'genus',
    taxidColumn: 'taxid',
    valueColumn: 'density',
  };

  const [initial] = taxidBalancedGroupMeans(rows, columns);
  const [withAnotherAssembly] = taxidBalancedGroupMeans(
    [...rows, { genus: 'Example', taxid: 'A', density: 5 }],
    columns
  );

  assert.equal(initial.mean, 10);
  assert.equal(initial.assemblyCount, 3);
  assert.equal(initial.uniqueTaxids, 2);
  assert.equal(withAnotherAssembly.mean, 10);
  assert.equal(withAnotherAssembly.assemblyCount, 4);
  assert.equal(withAnotherAssembly.uniqueTaxids, 2);
});

const child = (node: TreeNode, name: string) => {
  const match = node.children?.find(candidate => candidate.name === name);
  assert.ok(match, `expected ${name} below ${node.name}`);
  return match;
};

test('taxonomy tree preserves every standard intermediate rank and full path', () => {
  const row: TaxonomyTreeRow = {
    superkingdom: 'Eukaryota',
    viral_realm: null,
    kingdom: 'Metazoa',
    phylum: 'Chordata',
    class: 'Mammalia',
    order: 'Primates',
    family: 'Hominidae',
    genus: 'Homo',
    tax_name: 'Homo sapiens with a deliberately long scientific label',
    taxid: 9606,
    assembly_count: 3,
  };
  const [root] = buildTaxonomyTree([row]);

  assert.equal(root.rank, 'Superkingdom');
  const kingdom = child(root, 'Metazoa');
  assert.equal(kingdom.rank, 'Kingdom');
  const phylum = child(kingdom, 'Chordata');
  assert.equal(phylum.rank, 'Phylum');
  const classNode = child(phylum, 'Mammalia');
  assert.equal(classNode.rank, 'Class');
  const order = child(classNode, 'Primates');
  assert.equal(order.rank, 'Order');
  const family = child(order, 'Hominidae');
  assert.equal(family.rank, 'Family');
  const genus = child(family, 'Homo');
  assert.equal(genus.rank, 'Genus');
  assert.equal(child(genus, row.tax_name!).rank, 'Species');
});

test('missing ranks are explicit and viral realm is part of viral navigation', () => {
  const [root] = buildTaxonomyTree([{
    superkingdom: 'Viruses',
    viral_realm: 'Riboviria',
    kingdom: null,
    phylum: 'Negarnaviricota',
    class: null,
    order: 'Mononegavirales',
    family: null,
    genus: 'Examplevirus',
    tax_name: 'Example virus',
    taxid: 42,
    assembly_count: 2,
  }]);

  const realm = child(root, 'Riboviria');
  assert.equal(realm.rank, 'Viral realm');
  const kingdom = child(realm, 'Unclassified kingdom');
  assert.equal(kingdom.rank, 'Kingdom');
  const phylum = child(kingdom, 'Negarnaviricota');
  assert.equal(child(phylum, 'Unclassified class').rank, 'Class');
});

test('application and visualization typography are exactly 1.25x their prior sizes', () => {
  assert.equal(APP_FONT_SCALE, 1.25);
  assert.equal(MUI_BASE_FONT_SIZE, 14 * 1.25);
  assert.equal(VIZ_FONT.base, 12 * 1.25);
  assert.equal(VIZ_FONT.defaultTooltip, 14 * 1.25);
  assert.equal(VIZ_FONT.title, 18 * 1.25);
  assert.equal(VIZ_FONT.treemapLabel, 13 * 1.25);
  assert.equal(VIZ_FONT.treemapMin, 11 * 1.25);
  assert.equal(VIZ_FONT.treemapHeader, 14 * 1.25);
  assert.equal(VIZ_FONT.subscript, 7 * 1.25);
  assert.equal(VIZ_MUI_FONT.pageTitle, '1.875rem');
  assert.equal(VIZ_MUI_FONT.sectionTitle, '1.09375rem');
});

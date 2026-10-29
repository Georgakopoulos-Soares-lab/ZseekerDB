import assert from 'node:assert/strict';
import test from 'node:test';

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
import {
  TREEMAP_MIN_VISIBLE_AREA,
  TREEMAP_SERIES_BOUNDS,
} from '../src/utils/treemapLayout.ts';
import { shortenTaxonLabel } from '../src/utils/shortenLabel.ts';
import { gcHistogram, genomeSizeHistogram } from '../src/utils/histogramBins.ts';
import { SCORE_TICKS, COUNT_TICKS, linearTicks, tickPosition, ticksUpTo } from '../src/utils/tickScale.ts';

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
  assert.equal(VIZ_FONT.base, 12 * 1.25 + 2);
  assert.equal(VIZ_FONT.defaultTooltip, 14 * 1.25);
  assert.equal(VIZ_FONT.title, 18 * 1.25 + 2);
  assert.equal(VIZ_FONT.treemapLabel, 13 * 1.25);
  assert.equal(VIZ_FONT.treemapMin, 11 * 1.25);
  assert.equal(VIZ_FONT.treemapHeader, 14 * 1.25);
  assert.equal(VIZ_FONT.subscript, 7 * 1.25 + 2);
  assert.equal(VIZ_MUI_FONT.pageTitle, '1.875rem');
  assert.equal(VIZ_MUI_FONT.sectionTitle, '1.09375rem');
});

test('treemap reserves an inset on every edge and paints very small groups', () => {
  assert.ok(TREEMAP_SERIES_BOUNDS.left > 0);
  assert.ok(TREEMAP_SERIES_BOUNDS.right > 0);
  assert.ok(TREEMAP_SERIES_BOUNDS.top > 0);
  assert.ok(TREEMAP_SERIES_BOUNDS.bottom > 0);
  assert.equal(TREEMAP_MIN_VISIBLE_AREA, 1);
});

test('long taxon labels are cut at the first consonant after the 12th character', () => {
  assert.equal(shortenTaxonLabel('Methanobacteriati'), 'Methanobacter.');
  assert.equal(shortenTaxonLabel('Pseudomonadati'), 'Pseudomonadat.');
  assert.equal(shortenTaxonLabel('Fungi'), 'Fungi');
  assert.equal(shortenTaxonLabel('Abcdefghijklm'), 'Abcdefghijklm'); // 13 chars: unchanged
});

test('tick ladders stop at the first tick reaching the maximum and space ticks equally', () => {
  assert.deepEqual(ticksUpTo(SCORE_TICKS, 4134.5), [50, 75, 100, 200, 500, 1000, 5000]);
  assert.deepEqual(ticksUpTo(SCORE_TICKS, 500), [50, 75, 100, 200, 500]);
  assert.deepEqual(ticksUpTo(SCORE_TICKS, 10), [50, 75]);
  const ticks = ticksUpTo(COUNT_TICKS, 1000);
  assert.equal(tickPosition(ticks, 0), 0);
  assert.equal(tickPosition(ticks, 0.5), 0.5);
  assert.equal(tickPosition(ticks, 10), 2);
  assert.ok(Math.abs(tickPosition(ticks, 1000) - 4) < 1e-9);
  assert.ok(Math.abs(tickPosition(SCORE_TICKS, Math.sqrt(100 * 200)) - 2.5) < 1e-9);
});

test('linear median ticks end at the first round step above the highest median', () => {
  assert.deepEqual(linearTicks(50, 66), [50, 55, 60, 65, 70]);
  assert.deepEqual(linearTicks(9, 51), [9, 20, 30, 40, 50, 60]);
  assert.deepEqual(linearTicks(50, 65), [50, 55, 60, 65]);
});

test('genome size bins use round kb edges and GC bins never share an edge', () => {
  const g = genomeSizeHistogram([15_027_000, 1_000_000_000, 2_400_000_000]);
  assert.deepEqual(g.labels.slice(0, 3), ['0', '200,000', '400,000']);
  assert.equal(g.counts.reduce((a, b) => a + b, 0), 3);
  assert.equal(g.ranges[1], '200,000–400,000 kb');

  assert.deepEqual(gcHistogram([34.2, 34.9, 35.1]).labels, ['34', '35']);
  const wide = gcHistogram([20.5, 49.9, 75.3]);
  assert.deepEqual(wide.labels.slice(0, 2), ['20–21', '22–23']);
  assert.deepEqual(wide.counts.reduce((a, b) => a + b, 0), 3);
});

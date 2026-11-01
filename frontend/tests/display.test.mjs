import test from 'node:test';
import assert from 'node:assert/strict';
import { HUMAN_ASSEMBLY, toAccession, toDisplay, chromosomeSort, chromosomeWhere, chromosomePrefixWhere } from '../src/utils/chromosomes.ts';
import { shortenKingdom } from '../src/utils/kingdoms.ts';

test('all 24 human chromosome labels round-trip', () => {
  const labels = [...Array.from({ length: 22 }, (_, i) => String(i + 1)), 'X', 'Y'];
  labels.forEach((label, i) => {
    const accession = `NC_${String(60925 + i).padStart(6, '0')}.1`;
    assert.equal(toDisplay(accession, HUMAN_ASSEMBLY), label);
    assert.equal(toAccession(label, HUMAN_ASSEMBLY), accession);
  });
  assert.deepEqual([...labels].reverse().sort(chromosomeSort), labels);
  assert.deepEqual(['NC_060949.1', ...labels].sort(chromosomeSort), [...labels, 'NC_060949.1']);
});

test('other assemblies and unmapped human contigs pass through', () => {
  assert.equal(toDisplay('NC_060925.1', 'GCF_other.1'), 'NC_060925.1');
  assert.equal(toAccession('1', 'GCF_other.1'), '1');
  assert.equal(toDisplay('NC_060949.1', HUMAN_ASSEMBLY), 'NC_060949.1');
  assert.equal(toDisplay('NC_060925.1'), 'NC_060925.1');
  assert.equal(toAccession('MT', HUMAN_ASSEMBLY), 'MT');
});

test('filters apply aliases only to the human assembly, including species-wide searches', () => {
  assert.equal(chromosomeWhere('1', HUMAN_ASSEMBLY), '"Chromosome" = \'NC_060925.1\'');
  assert.equal(chromosomeWhere('1', 'GCF_other.1'), '"Chromosome" = \'1\'');
  assert.match(chromosomeWhere('1'), /assembly = 'GCF_009914755.1'/);
  assert.match(chromosomePrefixWhere('1'), /NC_060934.1/); // chromosome 10
  assert.match(chromosomePrefixWhere('1'), /assembly = 'GCF_009914755.1'/);
});

test('kingdom labels include the first consonant from character 13', () => {
  assert.equal(shortenKingdom('Methanobacteriati'), 'Methanobacter.');
  assert.equal(shortenKingdom('Metazoa'), 'Metazoa');
  assert.equal(shortenKingdom('abcdefghijklm'), 'abcdefghijklm');
  assert.equal(shortenKingdom('aaaaaaaaaaaaaab'), 'aaaaaaaaaaaaaab.');
  assert.equal(shortenKingdom('aaaaaaaaaaaaaaa'), 'aaaaaaaaaaaaaaa');
  assert.equal(shortenKingdom('abcdefghijklñop'), 'abcdefghijklñ.');
});

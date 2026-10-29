// Superkingdom palette shared by every chart that colours by superkingdom.
export const SK_COLORS: Record<string, string> = {
  Bacteria: '#f4c48f',
  Archaea: '#cfcfff',
  Eukaryota: '#c2dcc2',
  Viruses: '#a6d3df',
};

export const SK_FALLBACK_COLOR = '#bab0ac';

export const skColor = (superkingdom: string | null | undefined) =>
  SK_COLORS[String(superkingdom ?? '')] ?? SK_FALLBACK_COLOR;

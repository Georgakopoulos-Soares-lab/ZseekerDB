/**
 * Display-only shortening for long taxon names: names longer than 13 characters
 * are cut at the first consonant after the 12th character and get a trailing ".",
 * e.g. "Methanobacteriati" -> "Methanobacter.".
 */
export function shortenTaxonLabel(name: string): string {
  if (name.length <= 13) return name;
  for (let i = 12; i < name.length; i++) {
    if (/[b-df-hj-np-tv-z]/i.test(name[i])) return `${name.slice(0, i + 1)}.`;
  }
  return name;
}

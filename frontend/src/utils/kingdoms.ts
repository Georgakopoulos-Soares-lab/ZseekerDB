export function shortenKingdom(name: string): string {
  const chars = Array.from(name);
  if (chars.length <= 13) return name;
  // Count Unicode code points; preserve spelling and use Latin consonants,
  // including accented forms. If there is no later consonant, keep the name.
  const index = chars.findIndex((char, i) => {
    const base = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    return i >= 12 && /^[b-df-hj-np-tv-z]$/.test(base);
  });
  return index < 0 ? name : `${chars.slice(0, index + 1).join('')}.`;
}

// Populate only after anonymous public-link and checksum verification.
export interface ArchiveFile {
  filename: string;
  format: 'CSV' | 'JSON' | 'PARQUET' | 'BED';
  scope: 'All' | 'Archaea' | 'Bacteria' | 'Eukaryota' | 'Viruses';
  record: number;
  checksum: string;
}
export const archive: {
  doi: string | null; buildDate: string | null; assemblies: number | null;
  predictions: number | null; speciesTaxids: number | null;
  predictionBearingAssemblies: number | null;
  metadataSha256: string | null; files: ArchiveFile[];
} = {
  doi: null, buildDate: '2026-10-27', assemblies: 324200, predictions: 2563977909,
  speciesTaxids: 60841, predictionBearingAssemblies: 148217,
  metadataSha256: '2a67abe869d6ae5a88843ae98ff0e3ac966322cc2a2091bf51d01926f9ed051e', files: [],
};
export function archiveFileUrl(file: ArchiveFile): string {
  return `https://zenodo.org/records/${file.record}/files/${encodeURIComponent(file.filename)}?download=1`;
}

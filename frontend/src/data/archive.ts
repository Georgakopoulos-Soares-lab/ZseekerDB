// Public record metadata and file checksums verified anonymously on 2026-11-01.
// Keep published archive metadata separate from the verified runtime catalog.
export type ArchiveFormat = 'CSV' | 'JSON' | 'PARQUET' | 'BED';
export type ArchiveScope = 'All' | 'Archaea' | 'Bacteria' | 'Eukaryota' | 'Viruses';
export interface ArchiveFile {
  filename: string;
  format: ArchiveFormat;
  scope: ArchiveScope;
  record: number;
  checksum: string;
  bytes: number;
  part?: number;
}
export interface ArchiveRecord {
  id: number;
  doi: string;
  title: string;
  publicationDate: string;
}
const records: ArchiveRecord[] = [
  {
    "id": 23677146,
    "doi": "10.5281/zenodo.23677146",
    "title": "ZSeekerDB per superkingdom (Bacteria, Archaea, Viruses JSON) - October 2026",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677150,
    "doi": "10.5281/zenodo.23677150",
    "title": "ZSeekerDB per superkingdom (Bacteria, Archaea, Viruses CSV) - October 2026",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677152,
    "doi": "10.5281/zenodo.23677152",
    "title": "ZSeekerDB per superkingdom (Bacteria, Archaea, Viruses PARQUET) - October 2026",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677154,
    "doi": "10.5281/zenodo.23677154",
    "title": "ZSeekerDB per superkingdom (BED) - October 2026",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677297,
    "doi": "10.5281/zenodo.23677297",
    "title": "ZSeekerDB per superkingdom (Eukaryota PARQUET) - October 2026",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677533,
    "doi": "10.5281/zenodo.23677533",
    "title": "ZSeekerDB per superkingdom (Eukaryota CSV) - October 2026",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677610,
    "doi": "10.5281/zenodo.23677610",
    "title": "ZSeekerDB per superkingdom (Eukaryota JSON) - October 2026",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677625,
    "doi": "10.5281/zenodo.23677625",
    "title": "ZSeekerDB dataset (JSON) - October 2026, part 1 of 2",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677639,
    "doi": "10.5281/zenodo.23677639",
    "title": "ZSeekerDB dataset (CSV) - October 2026, part 1 of 2",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677745,
    "doi": "10.5281/zenodo.23677745",
    "title": "ZSeekerDB dataset (JSON) - October 2026, part 2 of 2",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677789,
    "doi": "10.5281/zenodo.23677789",
    "title": "ZSeekerDB dataset (PARQUET) - October 2026, part 2 of 2",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677791,
    "doi": "10.5281/zenodo.23677791",
    "title": "ZSeekerDB dataset (PARQUET) - October 2026, part 1 of 2",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23677870,
    "doi": "10.5281/zenodo.23677870",
    "title": "ZSeekerDB dataset (BED) - October 2026",
    "publicationDate": "2026-10-26"
  },
  {
    "id": 23678010,
    "doi": "10.5281/zenodo.23678010",
    "title": "ZSeekerDB dataset (CSV) - October 2026, part 2 of 2",
    "publicationDate": "2026-10-26"
  }
];
const files: ArchiveFile[] = [
  {
    "filename": "zseeker_csv_part1.tar.gz",
    "format": "CSV",
    "scope": "All",
    "record": 23677639,
    "checksum": "md5:e9d7b5674d6459a67abd026c0fda5cd9",
    "bytes": 32537333259,
    "part": 1
  },
  {
    "filename": "zseeker_csv_part2.tar.gz",
    "format": "CSV",
    "scope": "All",
    "record": 23678010,
    "checksum": "md5:495e31b45395565808df20b7ef455409",
    "bytes": 38629353395,
    "part": 2
  },
  {
    "filename": "zseeker_json_part1.tar.gz",
    "format": "JSON",
    "scope": "All",
    "record": 23677625,
    "checksum": "md5:4d98454d0dbff74e627fd12f1cb3b1d5",
    "bytes": 36283531688,
    "part": 1
  },
  {
    "filename": "zseeker_json_part2.tar.gz",
    "format": "JSON",
    "scope": "All",
    "record": 23677745,
    "checksum": "md5:93f3d8dec99ef16ecc76d9aebbd97847",
    "bytes": 42213812669,
    "part": 2
  },
  {
    "filename": "zseeker_parquet_part1.tar.gz",
    "format": "PARQUET",
    "scope": "All",
    "record": 23677791,
    "checksum": "md5:7afa52568b0c42dac490db36f4f74777",
    "bytes": 27429894596,
    "part": 1
  },
  {
    "filename": "zseeker_parquet_part2.tar.gz",
    "format": "PARQUET",
    "scope": "All",
    "record": 23677789,
    "checksum": "md5:aed4b2bf55417c62223205e96b9a9d34",
    "bytes": 32410828756,
    "part": 2
  },
  {
    "filename": "zseekerdb_bed.tar.gz",
    "format": "BED",
    "scope": "All",
    "record": 23677870,
    "checksum": "md5:a37ac7dff73ba57d3002a48e2d098a7b",
    "bytes": 23308638291
  },
  {
    "filename": "archaea_CSV.tar.gz",
    "format": "CSV",
    "scope": "Archaea",
    "record": 23677150,
    "checksum": "md5:348c8ad9e3df099571c6faf7539b048f",
    "bytes": 161140715
  },
  {
    "filename": "archaea_JSON.tar.gz",
    "format": "JSON",
    "scope": "Archaea",
    "record": 23677146,
    "checksum": "md5:7c6ff5ac89a506ca484b160261af192e",
    "bytes": 174840319
  },
  {
    "filename": "archaea_PARQUET.tar.gz",
    "format": "PARQUET",
    "scope": "Archaea",
    "record": 23677152,
    "checksum": "md5:be52c34c91cd905744deba1ade8f4205",
    "bytes": 140786034
  },
  {
    "filename": "archaea_BED.tar.gz",
    "format": "BED",
    "scope": "Archaea",
    "record": 23677154,
    "checksum": "md5:996eca9fcacf0300a732b4d42fa8b09a",
    "bytes": 45764529
  },
  {
    "filename": "bacteria_CSV.tar.gz",
    "format": "CSV",
    "scope": "Bacteria",
    "record": 23677150,
    "checksum": "md5:914b7d1ef2595c071267c368b7970259",
    "bytes": 32197901321
  },
  {
    "filename": "bacteria_JSON.tar.gz",
    "format": "JSON",
    "scope": "Bacteria",
    "record": 23677146,
    "checksum": "md5:ce3baf2fae43a518c1d1fac02859a942",
    "bytes": 34830045771
  },
  {
    "filename": "bacteria_PARQUET.tar.gz",
    "format": "PARQUET",
    "scope": "Bacteria",
    "record": 23677152,
    "checksum": "md5:385f589a45bbcdde14a971b4260b0af4",
    "bytes": 26513473447
  },
  {
    "filename": "bacteria_BED.tar.gz",
    "format": "BED",
    "scope": "Bacteria",
    "record": 23677154,
    "checksum": "md5:121c6a6aa4aa398259f6bdbae584a829",
    "bytes": 8518432379
  },
  {
    "filename": "eukaryota_CSV.tar.gz",
    "format": "CSV",
    "scope": "Eukaryota",
    "record": 23677533,
    "checksum": "md5:0d50a3776792077d2be98a05a49dd3b3",
    "bytes": 38698894986
  },
  {
    "filename": "eukaryota_JSON.tar.gz",
    "format": "JSON",
    "scope": "Eukaryota",
    "record": 23677610,
    "checksum": "md5:5b19f8ed49a5c25ee23533ae66c13b9a",
    "bytes": 43373743420
  },
  {
    "filename": "eukaryota_PARQUET.tar.gz",
    "format": "PARQUET",
    "scope": "Eukaryota",
    "record": 23677297,
    "checksum": "md5:48b128a5e5f6366d540ebab3b5b8bed2",
    "bytes": 33564391740
  },
  {
    "filename": "eukaryota_BED.tar.gz",
    "format": "BED",
    "scope": "Eukaryota",
    "record": 23677154,
    "checksum": "md5:7fea2a1dfa2ee88453cec87c3bdc818a",
    "bytes": 14705719006
  },
  {
    "filename": "viruses_CSV.tar.gz",
    "format": "CSV",
    "scope": "Viruses",
    "record": 23677150,
    "checksum": "md5:5e51135253d322b1fa2ca3c5ad84f5a9",
    "bytes": 94896640
  },
  {
    "filename": "viruses_JSON.tar.gz",
    "format": "JSON",
    "scope": "Viruses",
    "record": 23677146,
    "checksum": "md5:9bbb9e49e3b839372fab3111a7a0c3bd",
    "bytes": 105089869
  },
  {
    "filename": "viruses_PARQUET.tar.gz",
    "format": "PARQUET",
    "scope": "Viruses",
    "record": 23677152,
    "checksum": "md5:c72c438feea713f76cc192ea2cda264d",
    "bytes": 63645726
  },
  {
    "filename": "viruses_BED.tar.gz",
    "format": "BED",
    "scope": "Viruses",
    "record": 23677154,
    "checksum": "md5:a8ff8c6b69ec6a8225febfa6a5781408",
    "bytes": 27240868
  }
];

export const archive = {
  buildDate: '2026-10-27', assemblies: 324198, predictions: 2563977909,
  speciesTaxids: 60841, predictionBearingAssemblies: 148215,
  metadataSha256: '2a67abe869d6ae5a88843ae98ff0e3ac966322cc2a2091bf51d01926f9ed051e',
  verifiedAt: '2026-11-01',
  publishedAssemblies: 324198, publishedPredictions: 2563977897,
  records, files,
};

export function archiveFileUrl(file: ArchiveFile): string {
  return `https://zenodo.org/records/${file.record}/files/${encodeURIComponent(file.filename)}?download=1`;
}

export function archiveRecordUrl(file: ArchiveFile): string {
  return `https://zenodo.org/records/${file.record}`;
}

export function archiveFileLabel(file: ArchiveFile): string {
  return `${file.format === 'PARQUET' ? 'Parquet' : file.format}${file.part ? ` · part ${file.part} of 2` : ''}`;
}

export function archiveFileSize(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}

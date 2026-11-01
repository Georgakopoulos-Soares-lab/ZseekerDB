package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestHistogramCacheMatchesDatasetAndSample(t *testing.T) {
	s := newTestServer(t,
		`CREATE TABLE metadata_all (assembly VARCHAR,species_taxid BIGINT,obs_n_zdna BIGINT)`,
		`INSERT INTO metadata_all VALUES ('b',NULL,1),('a',1,2),('empty',3,0)`,
		`CREATE VIEW metadata AS SELECT * FROM metadata_all WHERE obs_n_zdna>0`,
		`CREATE TABLE data (assembly VARCHAR,"Start" BIGINT,"Z-DNA Score" FLOAT)`,
		`INSERT INTO data VALUES ('a',0,50),('a',4,60),('b',0,70)`,
		`CREATE TABLE data_kpis AS SELECT 3::BIGINT AS total_sites,60.0::DOUBLE AS avg_score,50.0::DOUBLE AS min_score,70.0::DOUBLE AS max_score,4.0::DOUBLE AS avg_seq_len`)
	ctx := context.Background()
	fingerprint, err := histogramFingerprint(ctx, s.db)
	if err != nil {
		t.Fatal(err)
	}
	expected := sha256.Sum256([]byte("a\t1\t2\nb\t-\t1\n"))
	if fingerprint != hex.EncodeToString(expected[:]) {
		t.Fatal("Python/cache input format changed", fingerprint)
	}
	bins := []scoreHistogramBin{{50, 1}, {60, 1}, {70, 1}}
	original := histogramCaches
	histogramCaches = []scoreHistogramCache{{Fingerprint: fingerprint, SamplePerTaxid: scoreSamplePerTaxid, Stats: histogramStats{3, 60, 50, 70, 4}, Bins: bins}}
	t.Cleanup(func() { histogramCaches = original })
	cached, ok, err := precomputedScoreHistogram(ctx, s.db)
	if err != nil || !ok || len(cached) != 3 {
		t.Fatalf("matching cache: %v %v %v", cached, ok, err)
	}
	rows, err := s.db.Query(homeScoreHistogramQuery)
	if err != nil {
		t.Fatal(err)
	}
	index := 0
	for rows.Next() {
		var bin scoreHistogramBin
		if err := rows.Scan(&bin.Bin, &bin.N); err != nil {
			t.Fatal(err)
		}
		if index >= len(cached) || cached[index] != bin {
			t.Fatal("cached sample differs from runtime SQL", bin, cached)
		}
		index++
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	rows.Close()
	if index != len(cached) {
		t.Fatal("cached sample bin count differs")
	}
	// Global totals are identical: swapping per-assembly counts must invalidate it.
	if _, err := s.db.Exec(`UPDATE metadata_all SET obs_n_zdna=CASE assembly WHEN 'a' THEN 1 WHEN 'b' THEN 2 ELSE 0 END`); err != nil {
		t.Fatal(err)
	}
	if _, ok, err := precomputedScoreHistogram(ctx, s.db); err != nil || ok {
		t.Fatalf("reused sample after assembly counts changed: %v %v", ok, err)
	}
	if _, err := s.db.Exec(`UPDATE metadata_all SET obs_n_zdna=CASE assembly WHEN 'a' THEN 2 WHEN 'b' THEN 1 ELSE 0 END, species_taxid=CASE WHEN assembly='a' THEN 2 ELSE species_taxid END`); err != nil {
		t.Fatal(err)
	}
	if _, ok, err := precomputedScoreHistogram(ctx, s.db); err != nil || ok {
		t.Fatalf("reused sample after species groups changed: %v %v", ok, err)
	}
}

func TestHistogramCacheChecksSourceStatistics(t *testing.T) {
	entry := scoreHistogramCache{Fingerprint: "fp", SamplePerTaxid: scoreSamplePerTaxid, Stats: histogramStats{3, 60, 50, 70, 4}, Bins: []scoreHistogramBin{{50, 3}}}
	if !entry.matches("fp", entry.Stats) {
		t.Fatal("matching source rejected")
	}
	for _, stats := range []histogramStats{{4, 60, 50, 70, 4}, {3, 61, 50, 70, 4}, {3, 60, 49, 70, 4}, {3, 60, 50, 71, 4}, {3, 60, 50, 70, 5}} {
		if entry.matches("fp", stats) {
			t.Fatal("changed source statistics accepted", stats)
		}
	}
	entry.SamplePerTaxid++
	if entry.matches("fp", entry.Stats) {
		t.Fatal("changed sample algorithm accepted")
	}
}

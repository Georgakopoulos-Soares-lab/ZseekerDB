package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strconv"
)

type scoreHistogramBin struct {
	Bin float64 `json:"bin"`
	N   int64   `json:"n"`
}

type histogramStats struct {
	TotalSites int64   `json:"total_sites"`
	AvgScore   float64 `json:"avg_score"`
	MinScore   float64 `json:"min_score"`
	MaxScore   float64 `json:"max_score"`
	AvgLength  float64 `json:"avg_seq_len"`
}

type scoreHistogramCache struct {
	Fingerprint    string              `json:"fingerprint"`
	SamplePerTaxid int                 `json:"sample_per_taxid"`
	Stats          histogramStats      `json:"stats"`
	Bins           []scoreHistogramBin `json:"bins"`
}

//go:embed assets/home_histograms.json
var embeddedHistograms []byte

var histogramCaches = func() []scoreHistogramCache {
	var entries []scoreHistogramCache
	if err := json.Unmarshal(embeddedHistograms, &entries); err != nil {
		log.Printf("Ignoring invalid precomputed homepage histograms: %v", err)
	}
	return entries
}()

func histogramFingerprint(ctx context.Context, db *sql.DB) (string, error) {
	rows, err := db.QueryContext(ctx, `SELECT assembly,species_taxid,obs_n_zdna FROM metadata_all WHERE obs_n_zdna>0 ORDER BY assembly`)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	digest := sha256.New()
	for rows.Next() {
		var assembly string
		var species sql.NullInt64
		var count int64
		if err := rows.Scan(&assembly, &species, &count); err != nil {
			return "", err
		}
		taxid := "-"
		if species.Valid {
			taxid = strconv.FormatInt(species.Int64, 10)
		}
		fmt.Fprintf(digest, "%s\t%s\t%d\n", assembly, taxid, count)
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func (entry scoreHistogramCache) matches(fingerprint string, stats histogramStats) bool {
	near := func(a, b float64) bool { return math.Abs(a-b) <= 1e-12*math.Max(1, math.Max(math.Abs(a), math.Abs(b))) }
	return entry.SamplePerTaxid == scoreSamplePerTaxid && entry.Fingerprint == fingerprint && entry.Stats.TotalSites == stats.TotalSites &&
		near(entry.Stats.AvgScore, stats.AvgScore) && near(entry.Stats.MinScore, stats.MinScore) &&
		near(entry.Stats.MaxScore, stats.MaxScore) && near(entry.Stats.AvgLength, stats.AvgLength) && len(entry.Bins) > 0
}

func precomputedScoreHistogram(ctx context.Context, db *sql.DB) ([]scoreHistogramBin, bool, error) {
	fingerprint, err := histogramFingerprint(ctx, db)
	if err != nil {
		return nil, false, err
	}
	// Check the source statistics as well as the complete observed-assembly input.
	// Metadata with the same global row count is not enough to reuse a sample.
	var total int64
	var avg, min, max, length sql.NullFloat64
	if err := db.QueryRowContext(ctx, "SELECT total_sites,avg_score,min_score,max_score,avg_seq_len FROM data_kpis LIMIT 1").Scan(&total, &avg, &min, &max, &length); err != nil {
		return nil, false, err
	}
	if !avg.Valid || !min.Valid || !max.Valid || !length.Valid {
		return nil, false, nil
	}
	stats := histogramStats{total, avg.Float64, min.Float64, max.Float64, length.Float64}
	for _, entry := range histogramCaches {
		if entry.matches(fingerprint, stats) {
			log.Printf("Homepage score histogram: using verified precomputed sample (%d predictions)", total)
			return entry.Bins, true, nil
		}
	}
	return nil, false, nil
}

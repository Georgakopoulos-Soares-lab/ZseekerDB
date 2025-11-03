// main.go
package main

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/marcboeker/go-duckdb"
)

type Config struct {
	DBPath  string
	Threads int
	// (κρατιούνται για συμβατότητα, δεν χρησιμοποιούνται πλέον)
	ZdnaParquet   string
	MetadataGlob  string
	TempDir       string
	MaxTempGiB    int
	MemoryLimitGB int
	Host          string
	Port          int
	CORSOrigins   []string
}

func loadConfig() (*Config, error) {
	_ = godotenv.Load()
	get := func(k, def string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return def
	}
	cfg := &Config{}
	// default στο path που χρησιμοποιείς
	cfg.DBPath = get("DUCKDB_PATH", "C:/zdna/zdnadatabase.duckdb")
	cfg.MetadataGlob = get("METADATA_GLOB", "")
	cfg.TempDir = get("DUCKDB_TEMP_DIR", "C:/zdna/data/tmp")
	if p, err := strconv.Atoi(get("DUCKDB_MAX_TEMP_GIB", "50")); err == nil {
		cfg.MaxTempGiB = p
	} else {
		cfg.MaxTempGiB = 50
	}
	if p, err := strconv.Atoi(get("DUCKDB_MEMORY_LIMIT_GB", "4")); err == nil {
		cfg.MemoryLimitGB = p
	} else {
		cfg.MemoryLimitGB = 4
	}
	cfg.Host = get("HOST", "0.0.0.0")
	if p, err := strconv.Atoi(get("PORT", "8080")); err == nil {
		cfg.Port = p
	} else {
		cfg.Port = 8080
	}
	if t, err := strconv.Atoi(get("DUCKDB_THREADS", "6")); err == nil {
		cfg.Threads = t
	} else {
		cfg.Threads = 6
	}
	origins := get("CORS_ORIGIN", "http://localhost:5173,http://localhost:3000")
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.CORSOrigins = append(cfg.CORSOrigins, o)
		}
	}
	return cfg, nil
}

func normalizePath(p string) string { return strings.ReplaceAll(p, "\\", "/") }
func sqlQuote(s string) string      { return strings.ReplaceAll(s, "'", "''") }
func quoteIdent(id string) string   { return `"` + strings.ReplaceAll(id, `"`, `""`) + `"` }

type Server struct {
	cfg *Config
	db  *sql.DB
}

func openDuckDB(cfg *Config) (*sql.DB, error) {
	dsn := fmt.Sprintf("%s?threads=%d", cfg.DBPath, cfg.Threads)
	db, err := sql.Open("duckdb", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	// optional pragmas
	td := normalizePath(cfg.TempDir)
	_ = os.MkdirAll(filepath.FromSlash(td), 0o755)
	db.Exec("PRAGMA threads = " + strconv.Itoa(cfg.Threads))
	db.Exec(fmt.Sprintf("PRAGMA temp_directory = '%s'", sqlQuote(td)))
	db.Exec(fmt.Sprintf("PRAGMA max_temp_directory_size = '%dGB'", cfg.MaxTempGiB))
	db.Exec(fmt.Sprintf("PRAGMA memory_limit = '%dGB'", cfg.MemoryLimitGB))
	return db, nil
}

// Αν υπάρχει ήδη table/view 'zdna', δεν κάνουμε τίποτα.
// Αν ΔΕΝ υπάρχει αλλά υπάρχει table 'data', εκθέτουμε view 'zdna' πάνω στο 'data'.
func (s *Server) createOrReplaceViews() error {
	var cnt int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM information_schema.tables WHERE LOWER(table_name)='zdna'`).Scan(&cnt)
	if cnt > 0 {
		return nil // υπάρχει ήδη base table 'zdna'
	}
	var hasData int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM information_schema.tables WHERE LOWER(table_name)='data'`).Scan(&hasData)
	if hasData > 0 {
		_, err := s.db.Exec(`
CREATE OR REPLACE VIEW zdna AS
SELECT "Chromosome","Start","End","Z-DNA Score","Sequence", "assembly" AS "Assembly" FROM data`)
		return err
	}
	return nil
}

func rowsToMaps(rows *sql.Rows) ([]map[string]any, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, 128)
	for rows.Next() {
		raw := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range raw {
			ptrs[i] = &raw[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := map[string]any{}
		for i, c := range cols {
			if b, ok := raw[i].([]byte); ok {
				m[c] = string(b)
			} else {
				m[c] = raw[i]
			}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func getColumnsLimit0(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("SELECT * FROM %s LIMIT 0", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return rows.Columns()
}

// ---------- health / admin ----------
func (s *Server) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "time": time.Now().UTC()})
}
func (s *Server) adminInit(c *gin.Context) {
	if err := s.createOrReplaceViews(); err != nil {
		log.Println("adminInit error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "views (re)created"})
}

// ---------- METADATA ----------
/* ... ίδιος κώδικας με πριν για:
   - metadataList
   - metadataExport
   - metadataTopClasses
   - metadataDistinct
(παραμένουν ακριβώς όπως στην προηγούμενη έκδοση που ήδη τρέχεις) */
/* ------------- αρχή αντιγραφής από την έκδοση που τρέχεις ------------- */
func (s *Server) metadataList(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	reqSort := strings.TrimSpace(c.DefaultQuery("sort", ""))
	strings.TrimSpace(c.DefaultQuery("sort", ""))
	dir := strings.ToUpper(strings.TrimSpace(c.Query("dir")))
	if dir != "ASC" && dir != "DESC" {
		dir = "ASC"
	}

	// Use configured columns instead of querying them
	cols := getMetadataColumns()

	// Build SELECT with proper aliases
	selectList := buildMetadataSelect()

	sortCol := cols[0]
	if reqSort != "" {
		for _, cName := range cols {
			if strings.EqualFold(cName, reqSort) {
				sortCol = cName
				break
			}
		}
	}
	orderBy := fmt.Sprintf(" ORDER BY %s %s", quoteIdent(sortCol), dir)

	whereParts := []string{}
	args := []any{}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		ors := make([]string, 0, len(cols))
		for _, col := range cols {
			ors = append(ors, fmt.Sprintf("LOWER(CAST(%s AS VARCHAR)) LIKE '%%' || LOWER(?) || '%%'", quoteIdent(col)))
			args = append(args, q)
		}
		whereParts = append(whereParts, "("+strings.Join(ors, " OR ")+")")
	}
	ciEq := func(col string) string { return fmt.Sprintf("LOWER(%s) = LOWER(?)", quoteIdent(col)) }
	maybeAddTax := func(name string) {
		val := strings.TrimSpace(c.Query(name))
		if val == "" {
			return
		}
		whereParts = append(whereParts, ciEq(name))
		args = append(args, val)
	}
	for _, t := range []string{"superkingdom", "kingdom", "phylum", "class", "order", "family", "genus", "tax_name"} {
		if strings.TrimSpace(c.Query(t)) != "" {
			maybeAddTax(t)
		}
	}
	if v := strings.TrimSpace(c.Query("assembly_eq")); v != "" {
		whereParts = append(whereParts, ciEq("assembly"))
		args = append(args, v)
	}
	if v := strings.TrimSpace(c.Query("taxid_eq")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			whereParts = append(whereParts, "taxid = ?")
			args = append(args, n)
		}
	}

	type rng struct{ col, min, max string }
	for _, r := range []rng{
		{"genome_size", "genome_size_min", "genome_size_max"},
		{"genome_size_ungapped", "genome_size_ungapped_min", "genome_size_ungapped_max"},
		{"gc_percent", "gc_percent_min", "gc_percent_max"},
	} {
		if v := strings.TrimSpace(c.Query(r.min)); v != "" {
			if n, err := strconv.ParseFloat(v, 64); err == nil {
				whereParts = append(whereParts, fmt.Sprintf("%s >= ?", quoteIdent(r.col)))
				args = append(args, n)
			}
		}
		if v := strings.TrimSpace(c.Query(r.max)); v != "" {
			if n, err := strconv.ParseFloat(v, 64); err == nil {
				whereParts = append(whereParts, fmt.Sprintf("%s <= ?", quoteIdent(r.col)))
				args = append(args, n)
			}
		}
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	var total int64
	if err := s.db.QueryRow("SELECT COUNT(*) FROM metadata"+where, args...).Scan(&total); err != nil {
		log.Println("metadataList count error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	q := "SELECT " + selectList + " FROM metadata " + where + orderBy + " LIMIT ? OFFSET ?"
	args = append(args, limit, offset)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		log.Println("metadataList data query error:", err, "sql:", q)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	data, err := rowsToMaps(rows)
	if err != nil {
		log.Println("metadataList scan error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respCols, _ := rows.Columns()
	if len(respCols) == 0 {
		respCols = cols
	}
	// When sending response, use the ordered labels
	c.JSON(http.StatusOK, gin.H{
		"columns": cols,
		"rows":    data,
		"limit":   limit,
		"offset":  offset,
		"total":   total,
	})
}

func (s *Server) metadataExport(c *gin.Context) {
	reqSort := strings.TrimSpace(c.DefaultQuery("sort", ""))
	dir := strings.ToUpper(strings.TrimSpace(c.Query("dir")))
	if dir != "ASC" && dir != "DESC" {
		dir = "ASC"
	}

	cols, err := getColumnsLimit0(s.db, "metadata")
	if err != nil || len(cols) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no metadata columns"})
		return
	}

	sortCol := cols[0]
	if reqSort != "" {
		for _, cName := range cols {
			if strings.EqualFold(cName, reqSort) {
				sortCol = cName
				break
			}
		}
	}
	orderBy := fmt.Sprintf(" ORDER BY %s %s", quoteIdent(sortCol), dir)

	where := ""
	var args []any
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		maxCols := 10
		if len(cols) < maxCols {
			maxCols = len(cols)
		}
		ors := make([]string, 0, maxCols)
		for i := 0; i < maxCols; i++ {
			ors = append(ors, fmt.Sprintf("LOWER(CAST(%s AS VARCHAR)) LIKE '%%' || LOWER(?) || '%%'", quoteIdent(cols[i])))
			args = append(args, q)
		}
		where = " WHERE " + strings.Join(ors, " OR ")
	}
	lim := 50000
	if s := strings.TrimSpace(c.Query("limit")); s != "" {
		if strings.EqualFold(s, "all") {
			lim = -1
		} else if n, err := strconv.Atoi(s); err == nil {
			lim = n
		}
	}
	selectList := buildMetadataSelect()
	q := "SELECT " + selectList + " FROM metadata" + where + orderBy
	if lim > 0 {
		q += fmt.Sprintf(" LIMIT %d", lim)
	}

	rows, err := s.db.Query(q, args...)
	if err != nil {
		log.Println("metadataExport query error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename=metadata_export.csv")

	w := csv.NewWriter(c.Writer)
	_ = w.Write(getMetadataColumns())
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			break
		}
		rec := make([]string, len(cols))
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				rec[i] = string(b)
			} else {
				rec[i] = fmt.Sprint(v)
			}
		}
		_ = w.Write(rec)
	}
	w.Flush()
}

func (s *Server) metadataTopClasses(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "12"))
	cols, err := getColumnsLimit0(s.db, "metadata")
	if err != nil || len(cols) == 0 {
		c.JSON(http.StatusOK, gin.H{"rows": []any{}, "data": []any{}, "labels": []string{}, "values": []int64{}, "datasets": []gin.H{{"label": "count", "data": []int64{}}}})
		return
	}
	// επιλέγουμε διαθέσιμη κατηγορική στήλη με προτεραιότητα
	col := ""
	for _, cand := range []string{"class", "kingdom", "phylum", "superkingdom"} {
		for _, cName := range cols {
			if strings.EqualFold(cName, cand) {
				col = cName
				break
			}
		}
		if col != "" {
			break
		}
	}
	if col == "" {
		col = cols[0]
	}

	q := fmt.Sprintf(`SELECT %s AS name, COUNT(*) AS value
                      FROM metadata
                      GROUP BY 1
                      ORDER BY value DESC NULLS LAST
                      LIMIT ?`, quoteIdent(col))
	rows, err := s.db.Query(q, limit)
	if err != nil {
		log.Println("metadataTopClasses query error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type pair struct {
		Name  string
		Value int64
	}
	res := []pair{}
	labels := []string{}
	values := []int64{}
	rowsForUI := []gin.H{}
	for rows.Next() {
		var n sql.NullString
		var v sql.NullInt64
		if err := rows.Scan(&n, &v); err != nil {
			continue
		}
		name := n.String
		val := v.Int64
		res = append(res, pair{Name: name, Value: val})
		labels = append(labels, name)
		values = append(values, val)
		rowsForUI = append(rowsForUI, gin.H{"class": name, "n": val})
	}
	c.JSON(http.StatusOK, gin.H{"rows": rowsForUI, "data": res, "labels": labels, "values": values, "datasets": []gin.H{{"label": col, "data": values}}})
}

func (s *Server) metadataDistinct(c *gin.Context) {
	field := strings.TrimSpace(c.Query("field"))
	if field == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing field"})
		return
	}
	allowed := map[string]bool{"superkingdom": true, "kingdom": true, "phylum": true, "class": true, "order": true, "family": true, "genus": true, "tax_name": true, "assembly": true, "taxid": true}
	if !allowed[strings.ToLower(field)] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "field not allowed"})
		return
	}

	whereParts := []string{}
	args := []any{}
	ciEq := func(col string) string { return fmt.Sprintf("LOWER(%s) = LOWER(?)", quoteIdent(col)) }
	maybe := func(name string) {
		v := strings.TrimSpace(c.Query(name))
		if v != "" {
			whereParts = append(whereParts, ciEq(name))
			args = append(args, v)
		}
	}
	for _, t := range []string{"superkingdom", "kingdom", "phylum", "class", "order", "family", "genus", "tax_name"} {
		maybe(t)
	}
	if v := strings.TrimSpace(c.Query("assembly_eq")); v != "" {
		whereParts = append(whereParts, ciEq("assembly"))
		args = append(args, v)
	}
	if v := strings.TrimSpace(c.Query("taxid_eq")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			whereParts = append(whereParts, "taxid = ?")
			args = append(args, n)
		}
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	q := fmt.Sprintf(`SELECT DISTINCT %s AS v FROM metadata %s ORDER BY v NULLS LAST LIMIT 1000`, quoteIdent(field), where)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var v sql.NullString
		_ = rows.Scan(&v)
		if v.Valid && strings.TrimSpace(v.String) != "" {
			out = append(out, v.String)
		}
	}
	c.JSON(http.StatusOK, gin.H{"values": out})
}

/* ------------- τέλος αντιγραφής ------------- */

// ---------- Z‑DNA ----------
func (s *Server) zdnaSearch(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	sortKey := strings.TrimSpace(c.Query("sort"))
	order := strings.ToUpper(c.DefaultQuery("order", "ASC"))
	if order != "ASC" && order != "DESC" {
		order = "ASC"
	}
	sortMap := map[string]string{"chrom": "Chromosome", "start": "Start", "end": "End", "score": "Z-DNA Score"}
	sortCol := ""
	if sortKey != "" && sortKey != "none" {
		if v, ok := sortMap[sortKey]; ok {
			sortCol = v
		}
	}

	whereParts := []string{}
	args := []any{}
	if v := strings.TrimSpace(c.Query("chr")); v != "" {
		whereParts = append(whereParts, `"Chromosome" = ?`)
		args = append(args, v)
	}
	if v := strings.TrimSpace(c.Query("assembly_eq")); v != "" {
		whereParts = append(whereParts, `"Assembly" = ?`)
		args = append(args, v)
	}
	if v := c.Query("start_gte"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Start" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("end_lte"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"End" <= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_min"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_max"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" <= ?`)
			args = append(args, n)
		}
	}
	if v := strings.TrimSpace(c.Query("seq")); v != "" {
		whereParts = append(whereParts, `LOWER("Sequence") LIKE '%' || LOWER(?) || '%'`)
		args = append(args, v)
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	fast := strings.TrimSpace(c.DefaultQuery("fast", "1")) == "1"
	var total int64 = -1
	if !fast {
		if err := s.db.QueryRow("SELECT COUNT(*) FROM data"+where, args...).Scan(&total); err != nil {
			log.Println("zdnaSearch count error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	selectList := `"Chromosome","Start","End","Z-DNA Score","Sequence"`
	orderBy := ""
	if sortCol != "" {
		orderBy = fmt.Sprintf(` ORDER BY "%s" %s`, sortCol, order)
	}
	q := "SELECT " + selectList + " FROM data" + where + orderBy + " LIMIT ? OFFSET ?"
	args2 := append([]any{}, args...)
	args2 = append(args2, limit, offset)
	rows, err := s.db.Query(q, args2...)
	if err != nil {
		log.Println("zdnaSearch data query error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	data, err := rowsToMaps(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"columns": []string{"Chromosome", "Start", "End", "Z-DNA Score", "Sequence"}, "rows": data, "limit": limit, "offset": offset, "total": total})
}

func (s *Server) zdnaExport(c *gin.Context) {
	sortKey := strings.TrimSpace(c.Query("sort"))
	order := strings.ToUpper(c.DefaultQuery("order", "ASC"))
	if order != "ASC" && order != "DESC" {
		order = "ASC"
	}
	sortMap := map[string]string{"chrom": "Chromosome", "start": "Start", "end": "End", "score": "Z-DNA Score"}
	sortCol := ""
	if sortKey != "" && sortKey != "none" {
		if v, ok := sortMap[sortKey]; ok {
			sortCol = v
		}
	}

	lim := 100000
	if s := strings.TrimSpace(c.Query("limit")); s != "" {
		if strings.EqualFold(s, "all") {
			lim = -1
		} else if n, err := strconv.Atoi(s); err == nil {
			lim = n
		}
	}
	off := 0
	if s := strings.TrimSpace(c.Query("offset")); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			off = n
		}
	}

	whereParts := []string{}
	args := []any{}
	if v := strings.TrimSpace(c.Query("chr")); v != "" {
		whereParts = append(whereParts, `"Chromosome" = ?`)
		args = append(args, v)
	}
	if v := c.Query("start_gte"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Start" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("end_lte"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"End" <= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_min"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_max"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" <= ?`)
			args = append(args, n)
		}
	}
	if v := strings.TrimSpace(c.Query("seq")); v != "" {
		whereParts = append(whereParts, `LOWER("Sequence") LIKE '%' || LOWER(?) || '%'`)
		args = append(args, v)
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	orderBy := ""
	if sortCol != "" {
		orderBy = fmt.Sprintf(` ORDER BY "%s" %s`, sortCol, order)
	}
	q := `SELECT "Chromosome","Start","End","Z-DNA Score","Sequence" FROM data ` + where + orderBy
	if lim > 0 {
		q += fmt.Sprintf(" LIMIT %d OFFSET %d", lim, off)
	}
	rows, err := s.db.Query(q, args...)
	if err != nil {
		log.Println("zdnaExport query error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename=zdna_export.csv")

	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"Chromosome", "Start", "End", "Z-DNA Score", "Sequence"})
	cols, _ := rows.Columns()
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			break
		}
		rec := make([]string, len(cols))
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				rec[i] = string(b)
			} else {
				rec[i] = fmt.Sprint(v)
			}
		}
		_ = w.Write(rec)
	}
	w.Flush()
}

// ΝΕΟ: autocomplete για Chromosome
func (s *Server) zdnaDistinctChr(c *gin.Context) {
	prefix := strings.TrimSpace(c.DefaultQuery("prefix", ""))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit <= 0 || limit > 1000 {
		limit = 10
	}

	q := `SELECT  "Chromosome" AS v FROM chromosomes`
	args := []any{}
	if prefix != "" {
		q += ` WHERE LOWER("Chromosome") LIKE LOWER(?)`
		args = append(args, prefix+"%")
	}
	//q += ` ORDER BY v LIMIT ?`
	//args = append(args, limit)

	rows, err := s.db.Query(q, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var v sql.NullString
		_ = rows.Scan(&v)
		if v.Valid && strings.TrimSpace(v.String) != "" {
			out = append(out, v.String)
		}
	}
	c.JSON(http.StatusOK, gin.H{"values": out})
}

// ---------- Histogram ----------
func (s *Server) zdnaScoreHistogram(c *gin.Context) {
	bin, _ := strconv.Atoi(c.DefaultQuery("bin", "5"))
	if bin <= 0 {
		bin = 5
	}
	approx := c.Query("approx") == "1"
	sampleRows, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("sample_rows", "200000")))
	if !approx {
		sampleRows = 0
	}

	whereParts := []string{}
	args := []any{}
	if v := strings.TrimSpace(c.Query("chr")); v != "" {
		whereParts = append(whereParts, `"Chromosome" = ?`)
		args = append(args, v)
	}
	if v := c.Query("score_min"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_max"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" <= ?`)
			args = append(args, n)
		}
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	buildSQL := func(withSample bool) string {
		fc := "FROM data"
		if withSample && sampleRows > 0 {
			fc = fmt.Sprintf("FROM data USING SAMPLE %d ROWS", sampleRows)
		}
		return fmt.Sprintf(`
SELECT CAST(floor("Z-DNA Score" / %[1]d) * %[1]d AS INT) AS bin,
       COUNT(*) AS count
%[2]s
%[3]s
GROUP BY 1
ORDER BY 1
`, bin, fc, where)
	}
	q := buildSQL(approx)
	rows, err := s.db.Query(q, args...)
	if err != nil && approx {
		q = buildSQL(false)
		rows, err = s.db.Query(q, args...)
	}
	if err != nil {
		log.Println("zdnaScoreHistogram query error:", err, "sql:", q)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type item struct{ Bin, Count int64 }
	data := []item{}
	labels := []int64{}
	values := []int64{}
	binsForUI := []gin.H{}
	for rows.Next() {
		var b, n sql.NullInt64
		if err := rows.Scan(&b, &n); err != nil {
			continue
		}
		bi := b.Int64
		ci := n.Int64
		data = append(data, item{Bin: bi, Count: ci})
		labels = append(labels, bi)
		values = append(values, ci)
		binsForUI = append(binsForUI, gin.H{"bin_start": bi, "n": ci})
	}
	c.JSON(http.StatusOK, gin.H{"data": data, "bins": binsForUI, "labels": labels, "values": values, "datasets": []gin.H{{"label": "Z-DNA Score", "data": values}}, "sample_rows": sampleRows})
}

// ---------- SQL ----------
func (s *Server) sqlGet(c *gin.Context) {
	stmt := strings.TrimSpace(c.Query("query"))
	if stmt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing query parameter"})
		return
	}
	runSQL(s, c, stmt)
}

type sqlPayload struct {
	SQL string `json:"sql"`
}

func (s *Server) sqlPost(c *gin.Context) {
	var p sqlPayload
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}
	runSQL(s, c, strings.TrimSpace(p.SQL))
}
func runSQL(s *Server, c *gin.Context, stmt string) {
	if stmt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty sql"})
		return
	}
	up := strings.ToUpper(stmt)
	if !(strings.HasPrefix(up, "SELECT ") || strings.HasPrefix(up, "EXPLAIN ") || strings.HasPrefix(up, "DESCRIBE ")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only SELECT/EXPLAIN/DESCRIBE are allowed"})
		return
	}
	rows, err := s.db.Query(stmt)
	if err != nil {
		log.Println("sql error:", err, "sql:", stmt)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	data, err := rowsToMaps(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// Metadata column configuration
type metadataColumn struct {
	DbName string // Database column name
	Label  string // Frontend display name
	Hidden bool   // Hidden by default in UI
}

// Column definitions in display order
var metadataColumns = []metadataColumn{
	{DbName: "assembly", Label: "Assembly", Hidden: false},
	{DbName: "bioproject", Label: "Bioproject", Hidden: true},
	{DbName: "biosample", Label: "Biosample", Hidden: true},
	{DbName: "taxid", Label: "Taxon ID", Hidden: false},
	{DbName: "assembly_level", Label: "Assembly level", Hidden: true},
	{DbName: "genome_size", Label: "Genome size", Hidden: false},
	{DbName: "gc_percent", Label: "GC content (%)", Hidden: false},
	{DbName: "superkingdom", Label: "Superkingdom", Hidden: false},
	{DbName: "kingdom", Label: "Kingdom", Hidden: false},
	{DbName: "phylum", Label: "Phylum", Hidden: false},
	{DbName: "class", Label: "Class", Hidden: false},
	{DbName: "order", Label: "Order", Hidden: false},
	{DbName: "family", Label: "Family", Hidden: false},
	{DbName: "genus", Label: "Genus", Hidden: false},
	{DbName: "tax_name", Label: "Specie", Hidden: false},
	{DbName: "is_t2t", Label: "T2T", Hidden: false},
	{DbName: "viral_realm", Label: "Viral realm", Hidden: false},
	{DbName: "updated_tax_name", Label: "Infraspecific name", Hidden: false},
	{DbName: "obs_zbp", Label: "Z-DNA bps", Hidden: false},
	{DbName: "obs_density_per_kb", Label: "Z-DNA density (per kb)", Hidden: false},
	{DbName: "obs_n_zdna", Label: "Number of predictions", Hidden: false},
}

// Helper to build SELECT clause with proper column aliases
func buildMetadataSelect() string {
	parts := make([]string, len(metadataColumns))
	for i, col := range metadataColumns {
		if col.Label == col.DbName {
			parts[i] = quoteIdent(col.DbName)
		} else {
			parts[i] = fmt.Sprintf("%s AS %s",
				quoteIdent(col.DbName),
				quoteIdent(col.Label))
		}
	}
	return strings.Join(parts, ", ")
}

// Helper to get ordered column labels
func getMetadataColumns() []string {
	cols := make([]string, len(metadataColumns))
	for i, col := range metadataColumns {
		cols[i] = col.Label
	}
	return cols
}

// ---------- CORS & main ----------
func corsMiddleware(allowed []string) gin.HandlerFunc {
	allowAll := false
	set := map[string]struct{}{}
	for _, o := range allowed {
		o = strings.TrimSpace(o)
		if o == "*" {
			allowAll = true
		} else if o != "" {
			set[o] = struct{}{}
		}
	}
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if allowAll && origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if _, ok := set[origin]; ok {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Vary", "Origin")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("Opening DuckDB at %s", cfg.DBPath)
	db, err := openDuckDB(cfg)
	if err != nil {
		log.Fatalf("open duckdb: %v", err)
	}
	defer db.Close()

	s := &Server{cfg: cfg, db: db}
	_ = s.createOrReplaceViews() // «ήπιο» init

	r := gin.Default()
	r.Use(corsMiddleware(cfg.CORSOrigins))

	// health/admin
	r.GET("/api/health", s.health)
	r.POST("/api/admin/init", s.adminInit)

	// metadata
	r.GET("/api/metadata/distinct", s.metadataDistinct)
	r.GET("/api/metadata/list", s.metadataList)
	r.GET("/api/metadata/classes/top", s.metadataTopClasses)
	r.GET("/api/metadata/export", s.metadataExport)

	// zdna
	r.GET("/api/zdna/search", s.zdnaSearch)
	r.GET("/api/zdna/export", s.zdnaExport)
	r.GET("/api/zdna/distinct_chr", s.zdnaDistinctChr) // ΝΕΟ
	r.GET("/api/zdna/score_histogram", s.zdnaScoreHistogram)

	// sql helpers
	r.GET("/api/sql", s.sqlGet)
	r.POST("/api/sql", s.sqlPost)

	// quick previews
	r.GET("/api/metadata/preview", func(c *gin.Context) {
		selectList := buildMetadataSelect()
		rows, err := s.db.Query("SELECT " + selectList + " FROM metadata LIMIT 100")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		data, _ := rowsToMaps(rows)
		c.JSON(http.StatusOK, gin.H{
			"columns": getMetadataColumns(),
			"data":    data,
		})
	})
	r.GET("/api/zdna/preview", func(c *gin.Context) {
		rows, err := s.db.Query(`SELECT "Chromosome","Start","End","Z-DNA Score","Sequence" FROM data LIMIT 100`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		data, _ := rowsToMaps(rows)
		c.JSON(http.StatusOK, gin.H{"data": data})
	})

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	log.Printf("ZDNA backend listening on http://%s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}

package main

import (
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode"
)

const sqlMaxLength = 32768
const sqlMaxRows = 50000
const sqlTimeout = 30 * time.Second

// SQL tokens preserve quoted identifiers and hide string literal contents. This
// deliberately accepts a small analytical SQL dialect used by the portal.
type sqlToken struct {
	text    string
	literal bool
	quoted  bool
}

func sqlTokens(stmt string) ([]sqlToken, error) {
	var tokens []sqlToken
	for i := 0; i < len(stmt); {
		c := stmt[i]
		if unicode.IsSpace(rune(c)) {
			i++
			continue
		}
		if c == ';' || c == '$' || (i+1 < len(stmt) && (stmt[i:i+2] == "--" || stmt[i:i+2] == "/*")) {
			return nil, fmt.Errorf("SQL comments, dollar quoting and statement separators are not allowed")
		}
		if c == '\'' || c == '"' {
			quote := c
			i++
			var value strings.Builder
			closed := false
			for i < len(stmt) {
				if stmt[i] == quote {
					if i+1 < len(stmt) && stmt[i+1] == quote {
						value.WriteByte(quote)
						i += 2
						continue
					}
					i++
					closed = true
					break
				}
				value.WriteByte(stmt[i])
				i++
			}
			if !closed {
				return nil, fmt.Errorf("unterminated SQL quote")
			}
			tokens = append(tokens, sqlToken{strings.ToUpper(value.String()), quote == '\'', quote == '"'})
			continue
		}
		if unicode.IsLetter(rune(c)) || c == '_' {
			start := i
			i++
			for i < len(stmt) && (unicode.IsLetter(rune(stmt[i])) || unicode.IsDigit(rune(stmt[i])) || stmt[i] == '_') {
				i++
			}
			tokens = append(tokens, sqlToken{text: strings.ToUpper(stmt[start:i])})
			continue
		}
		tokens = append(tokens, sqlToken{text: string(c)})
		i++
	}
	return tokens, nil
}

func validateSQL(stmt string) error {
	if len(stmt) == 0 || len(stmt) > sqlMaxLength {
		return fmt.Errorf("SQL length must be 1–%d bytes", sqlMaxLength)
	}
	ts, err := sqlTokens(stmt)
	if err != nil {
		return err
	}
	if len(ts) == 0 || ts[0].quoted || (ts[0].text != "SELECT" && ts[0].text != "WITH") {
		return fmt.Errorf("only a single SELECT or read-only WITH query is allowed")
	}
	forbidden := strings.Fields("INSERT UPDATE DELETE DROP ALTER CREATE ATTACH DETACH COPY EXPORT IMPORT INSTALL LOAD PRAGMA CALL SET RESET VACUUM TRUNCATE GRANT REVOKE MERGE PIVOT UNPIVOT INTO SHOW DESCRIBE EXPLAIN SUMMARIZE SECRET SECRETS")
	functions := strings.Fields("HASH COUNT AVG MIN MAX SUM LENGTH LOWER UPPER COALESCE NULLIF TRY_CAST CAST FLOOR CEIL CEILING ROUND ABS SQRT LOG10 LN POWER QUANTILE QUANTILE_CONT QUANTILE_DISC MEDIAN STDDEV_POP STDDEV_SAMP VAR_POP VAR_SAMP ROW_NUMBER RANK DENSE_RANK RANDOM REPLACE SUBSTR SUBSTRING LEFT RIGHT CONCAT CONCAT_WS GREATEST LEAST ISFINITE")
	// Grammar keywords followed by parentheses are not function calls.
	grammar := strings.Fields("AS IN EXISTS OVER FILTER WITH SELECT FROM WHERE AND OR NOT PARTITION BY ORDER GROUP HAVING DISTINCT DOUBLE FLOAT BIGINT INTEGER INT VARCHAR DECIMAL")
	allowed := map[string]bool{}
	for _, v := range append(functions, grammar...) {
		allowed[v] = true
	}
	relations := map[string]bool{}
	for _, v := range strings.Fields("DATA ZDNA METADATA METADATA_ALL METADATA_VIEW CHROMOSOMES TAX_NAMES DATA_KPIS DATA_TOP_ASM DATA_TOP_CHROM") {
		relations[v] = true
	}
	// CTE names may be used as relations. The engine still validates their syntax.
	for i := 1; i+2 < len(ts); i++ {
		if ts[i+1].text == "AS" && ts[i+2].text == "(" && !ts[i].literal {
			relations[ts[i].text] = true
		}
	}
	for i, t := range ts {
		if t.literal {
			continue
		}
		if !t.quoted {
			for _, v := range forbidden {
				if t.text == v {
					return fmt.Errorf("SQL command %s is not allowed", v)
				}
			}
		}
		if i+1 < len(ts) && ts[i+1].text == "(" && (t.quoted || len(t.text) > 0 && (unicode.IsLetter(rune(t.text[0])) || t.text[0] == '_')) && !allowed[t.text] {
			return fmt.Errorf("SQL function %s is not allowed", t.text)
		}
		if (t.text == "FROM" || t.text == "JOIN") && !t.quoted && i+1 < len(ts) {
			next := ts[i+1]
			// FROM inside EXTRACT/TRIM is outside the supported dialect.
			if next.text != "(" && (next.literal || !relations[next.text]) {
				return fmt.Errorf("only portal tables and query-local CTEs can be read")
			}
			if i+2 < len(ts) && ts[i+2].text == "." {
				return fmt.Errorf("qualified external relations are not allowed")
			}
		}
	}
	return nil
}

type sqlRateWindow struct {
	start time.Time
	count int
}

var sqlRate = struct {
	sync.Mutex
	clients map[string]sqlRateWindow
}{clients: map[string]sqlRateWindow{}}

func allowSQL(ip string) bool {
	sqlRate.Lock()
	defer sqlRate.Unlock()
	now := time.Now()
	for key, w := range sqlRate.clients {
		if now.Sub(w.start) >= time.Minute {
			delete(sqlRate.clients, key)
		}
	}
	w, exists := sqlRate.clients[ip]
	if !exists {
		if len(sqlRate.clients) >= 10000 {
			return false
		}
		w.start = now
	}
	if w.count >= 120 {
		return false
	}
	w.count++
	sqlRate.clients[ip] = w
	return true
}

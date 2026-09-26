// In-memory SQLite (node:sqlite) for Core v2. One process-wide instance (HMR-safe via globalThis).
// Optional snapshot: VACUUM INTO a file on an interval, restored on boot (CTS_CORE_SNAPSHOT=path).
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS symbols (sym TEXT PRIMARY KEY, last REAL, quote_vol REAL, change_pct REAL, bars INTEGER DEFAULT 0, first_t INTEGER, last_t INTEGER, at INTEGER);
CREATE TABLE IF NOT EXISTS candles (sym TEXT NOT NULL, t INTEGER NOT NULL, o REAL, h REAL, l REAL, c REAL, v REAL, PRIMARY KEY (sym, t)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY, stage INTEGER, bot TEXT, ind TEXT, tp REAL, sl REAL, trail REAL, hold INTEGER,
  n INTEGER, pf REAL, net REAL, wr REAL, mdd REAL, ddt REAL, gh REAL, tph REAL,
  is_n INTEGER, is_pf REAL, is_net REAL, score REAL, rank INTEGER, armed INTEGER DEFAULT 0,
  best_n INTEGER, oos_n INTEGER, oos_pf REAL, oos_net REAL, oos_ddt REAL, lastn_ok INTEGER, eval_pass REAL, eval_ok INTEGER,
  by_sym TEXT, at INTEGER);
CREATE INDEX IF NOT EXISTS results_stage ON results(stage, score DESC);
CREATE TABLE IF NOT EXISTS lastn (cfg TEXT NOT NULL, n INTEGER NOT NULL, part TEXT NOT NULL, taken INTEGER, pf REAL, net REAL, ddt REAL, score REAL, PRIMARY KEY (cfg, n, part)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS evals (id INTEGER PRIMARY KEY AUTOINCREMENT, cfg TEXT NOT NULL, at INTEGER NOT NULL, win TEXT NOT NULL, n INTEGER, pf REAL, net REAL, ddt REAL, wr REAL, pass INTEGER);
CREATE INDEX IF NOT EXISTS evals_cfg ON evals(cfg, at);
CREATE TABLE IF NOT EXISTS tapes (cfg TEXT NOT NULL, sym TEXT NOT NULL, side INTEGER, entry_t INTEGER NOT NULL, exit_t INTEGER, entry REAL, exit REAL, r REAL, reason TEXT, bars INTEGER, PRIMARY KEY (cfg, sym, entry_t)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS sim_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, start_t INTEGER, end_t INTEGER, n INTEGER, pf REAL, net REAL, gh REAL, tph REAL, ddt REAL, stable INTEGER, opts TEXT, blocks TEXT, hourly TEXT);
CREATE TABLE IF NOT EXISTS paper_trades (cfg TEXT NOT NULL, sym TEXT NOT NULL, side INTEGER, entry_t INTEGER NOT NULL, exit_t INTEGER, entry REAL, exit REAL, r REAL, pnl REAL, reason TEXT, PRIMARY KEY (cfg, sym, entry_t)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS paper_positions (cfg TEXT NOT NULL, sym TEXT NOT NULL, side INTEGER, entry_t INTEGER, entry REAL, stop REAL, target REAL, mtm REAL, at INTEGER, PRIMARY KEY (cfg, sym)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS live_orders (coid TEXT PRIMARY KEY, cfg TEXT, sym TEXT, side INTEGER, kind TEXT, qty REAL, px REAL, status TEXT, msg TEXT, at INTEGER);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, level TEXT NOT NULL, msg TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, started INTEGER, ended INTEGER, items INTEGER, ms REAL, note TEXT);
`;

const TABLES = ["kv", "symbols", "candles", "results", "lastn", "evals", "tapes", "sim_runs", "paper_trades", "paper_positions", "live_orders", "events", "runs"];

export class CoreDb {
  readonly db: DatabaseSync;
  private stmts = new Map<string, StatementSync>();
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = MEMORY; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY;");
    this.db.exec(SCHEMA);
  }
  prep(sql: string): StatementSync {
    let s = this.stmts.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmts.set(sql, s);
    }
    return s;
  }
  tx<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  all<T = Record<string, unknown>>(sql: string, ...p: Array<string | number | null>): T[] {
    return this.prep(sql).all(...p) as T[];
  }
  get<T = Record<string, unknown>>(sql: string, ...p: Array<string | number | null>): T | undefined {
    return this.prep(sql).get(...p) as T | undefined;
  }
  run(sql: string, ...p: Array<string | number | null>) {
    return this.prep(sql).run(...p);
  }
  kvGet<T>(k: string): T | undefined {
    const r = this.get<{ v: string }>("SELECT v FROM kv WHERE k = ?", k);
    return r ? (JSON.parse(r.v) as T) : undefined;
  }
  kvSet(k: string, v: unknown) {
    this.run("INSERT INTO kv (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at", k, JSON.stringify(v), Date.now());
  }
  event(level: "info" | "warn" | "error", msg: string) {
    this.run("INSERT INTO events (at, level, msg) VALUES (?, ?, ?)", Date.now(), level, msg.slice(0, 500));
  }
  /** Row counts and page usage for the Engine page. */
  tableStats(): Array<{ table: string; rows: number }> {
    return TABLES.map((t) => ({ table: t, rows: Number(this.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)?.n ?? 0) }));
  }
  bytes(): number {
    const pc = Number(this.get<{ page_count: number }>("PRAGMA page_count")?.page_count ?? 0);
    const ps = Number(this.get<{ page_size: number }>("PRAGMA page_size")?.page_size ?? 4096);
    return pc * ps;
  }
  trim() {
    this.run("DELETE FROM events WHERE id <= (SELECT MAX(id) - 3000 FROM events)");
    this.run("DELETE FROM evals WHERE id <= (SELECT MAX(id) - 20000 FROM evals)");
    this.run("DELETE FROM runs WHERE id <= (SELECT MAX(id) - 500 FROM runs)");
    this.run("DELETE FROM sim_runs WHERE id <= (SELECT MAX(id) - 200 FROM sim_runs)");
  }
  snapshot(path: string): boolean {
    try {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      if (existsSync(tmp)) renameSync(tmp, `${tmp}.old`);
      this.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      renameSync(tmp, path);
      return true;
    } catch {
      return false;
    }
  }
  restore(path: string): boolean {
    if (!existsSync(path)) return false;
    try {
      this.db.exec(`ATTACH DATABASE '${path.replace(/'/g, "''")}' AS snap`);
      this.tx(() => {
        for (const t of TABLES) {
          const exists = this.get<{ n: number }>("SELECT COUNT(*) AS n FROM snap.sqlite_master WHERE type='table' AND name = ?", t);
          if (exists?.n) this.db.exec(`INSERT OR REPLACE INTO main.${t} SELECT * FROM snap.${t}`);
        }
      });
      this.db.exec("DETACH DATABASE snap");
      return true;
    } catch {
      try {
        this.db.exec("DETACH DATABASE snap");
      } catch {
        /* not attached */
      }
      return false;
    }
  }
}

const G = globalThis as unknown as { __ctsCoreDb?: CoreDb };
export function coreDb(): CoreDb {
  if (!G.__ctsCoreDb) G.__ctsCoreDb = new CoreDb(":memory:");
  return G.__ctsCoreDb;
}

import Database from "better-sqlite3";
import path from "path";

const db = new Database(process.env.DB_PATH ?? path.join(process.cwd(), "motorapi.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS lookups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plate       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL DEFAULT '',
    searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    data        TEXT NOT NULL
  )
`);

// Migrationer
try { db.exec("ALTER TABLE lookups ADD COLUMN name TEXT NOT NULL DEFAULT ''"); } catch { /* findes allerede */ }
try { db.exec("CREATE UNIQUE INDEX idx_lookups_plate ON lookups (plate)"); } catch { /* findes allerede */ }

const upsertLookup = db.prepare(`
  INSERT INTO lookups (plate, data, searched_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(plate) DO UPDATE SET
    data = excluded.data,
    searched_at = excluded.searched_at
`);

const updateName = db.prepare(
  "UPDATE lookups SET name = ? WHERE plate = ?"
);

const getAllLookups = db.prepare(
  "SELECT id, plate, name, searched_at, data FROM lookups ORDER BY searched_at DESC"
);

const getLatestByPlate = db.prepare(
  "SELECT id, plate, name, searched_at, data FROM lookups WHERE plate = ? LIMIT 1"
);

export interface LookupRow {
  id: number;
  plate: string;
  name: string;
  searched_at: string;
  data: string;
}

export function saveLookup(plate: string, data: unknown): void {
  upsertLookup.run(plate, JSON.stringify(data));
}

export function setName(plate: string, name: string): void {
  updateName.run(name, plate.toUpperCase());
}

export function getLookups(): LookupRow[] {
  return getAllLookups.all() as LookupRow[];
}

export function getCachedLookup(plate: string): LookupRow | undefined {
  return getLatestByPlate.get(plate.toUpperCase()) as LookupRow | undefined;
}

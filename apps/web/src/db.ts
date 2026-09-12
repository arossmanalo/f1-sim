import Dexie, { type EntityTable } from "dexie";
import { normalizeUniverse, type SourceSnapshot, type Universe } from "@f1-sim/core";

export interface StoredSnapshot extends SourceSnapshot {
  payload?: unknown;
}

class F1SimDatabase extends Dexie {
  universes!: EntityTable<Universe, "id">;
  snapshots!: EntityTable<StoredSnapshot, "id">;
  settings!: EntityTable<{ key: string; value: unknown }, "key">;

  constructor() {
    super("f1-sim");
    this.version(1).stores({
      universes: "id, updatedAt, mode, season.year",
      snapshots: "id, season, fetchedAt, provider",
      settings: "key",
    });
    // The indexes did not change in schema v2. Bumping Dexie still records the
    // application migration, while normalization below upgrades each save
    // idempotently and keeps a malformed record from blocking every universe.
    this.version(2).stores({
      universes: "id, updatedAt, mode, season.year",
      snapshots: "id, season, fetchedAt, provider",
      settings: "key",
    });
  }
}

export const db = new F1SimDatabase();

export async function loadUniverses(): Promise<Universe[]> {
  const stored = await db.universes.orderBy("updatedAt").reverse().toArray();
  const valid: Universe[] = [];
  for (const candidate of stored) {
    try {
      const normalized = normalizeUniverse(candidate);
      valid.push(normalized);
      if (candidate.schemaVersion !== normalized.schemaVersion) await db.universes.put(normalized);
    } catch {
      // Preserve the invalid IndexedDB row for manual recovery/export, but do
      // not allow one damaged save to prevent the rest of the library loading.
    }
  }
  return valid;
}

export async function saveUniverse(universe: Universe): Promise<void> {
  const normalized = normalizeUniverse(universe);
  await db.universes.put(normalized);
  await db.settings.put({ key: "lastUniverseId", value: normalized.id });
}

export async function deleteUniverse(id: string): Promise<void> {
  await db.universes.delete(id);
}

export async function lastUniverseId(): Promise<string | undefined> {
  return (await db.settings.get("lastUniverseId"))?.value as string | undefined;
}

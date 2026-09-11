import Dexie, { type EntityTable } from "dexie";
import type { SourceSnapshot, Universe } from "@f1-sim/core";

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
  }
}

export const db = new F1SimDatabase();

export async function loadUniverses(): Promise<Universe[]> {
  return db.universes.orderBy("updatedAt").reverse().toArray();
}

export async function saveUniverse(universe: Universe): Promise<void> {
  await db.universes.put(universe);
  await db.settings.put({ key: "lastUniverseId", value: universe.id });
}

export async function deleteUniverse(id: string): Promise<void> {
  await db.universes.delete(id);
}

export async function lastUniverseId(): Promise<string | undefined> {
  return (await db.settings.get("lastUniverseId"))?.value as string | undefined;
}

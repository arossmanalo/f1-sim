import Dexie, { type EntityTable } from "dexie";
import { normalizeUniverse, type NormalizedUniverse, type SourceSnapshot, type Universe } from "@f1-sim/core";

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
  // Engine commands already return a normalized v2 universe. Re-cloning and
  // re-normalizing that entire object for every autosave made long simulations
  // progressively slower as season history and audit entries accumulated.
  // Keep the migration safety net for legacy or malformed records, but take a
  // zero-copy path for canonical in-memory state. Dexie performs its own clone
  // when writing to IndexedDB.
  const normalized = isNormalizedForPersistence(universe) ? universe : normalizeUniverse(universe);
  await db.universes.put(normalized);
  await db.settings.put({ key: "lastUniverseId", value: normalized.id });
}

function isNormalizedForPersistence(universe: Universe): universe is NormalizedUniverse {
  if (universe.schemaVersion !== 2 || !universe.worldConfig || !universe.juniorState
    || !Array.isArray(universe.aiDecisions) || !Array.isArray(universe.managementEvents)
    || !Array.isArray(universe.seasonHistory)) return false;
  const driversReady = universe.season.drivers.every((driver) => Boolean(
    driver.advancedRatings && driver.personality && driver.careerStats && driver.status
      && driver.careerPhase && driver.archetype && driver.countryCode
      && driver.potentialMin !== undefined && driver.potentialMax !== undefined
      && driver.developmentRate !== undefined && driver.generatedDriver !== undefined
      && driver.reputation !== undefined && driver.financialBackingCredits !== undefined
      && driver.sponsorshipValue !== undefined,
  ));
  const teamsReady = universe.season.teams.every((team) => Boolean(
    team.careerStats && team.reputation !== undefined && team.budgetCredits !== undefined
      && team.driverBudgetCredits !== undefined && team.developmentQuality !== undefined
      && team.academyQuality !== undefined && team.facilities !== undefined
      && team.scoutingQuality !== undefined && team.philosophy && team.strategyState
      && team.riskTolerance !== undefined && team.prestige !== undefined
      && team.championshipExpectations !== undefined,
  ));
  return driversReady && teamsReady;
}

export async function deleteUniverse(id: string): Promise<void> {
  await db.universes.delete(id);
}

export async function lastUniverseId(): Promise<string | undefined> {
  return (await db.settings.get("lastUniverseId"))?.value as string | undefined;
}

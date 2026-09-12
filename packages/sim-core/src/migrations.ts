import { normalizeWorldConfig } from "./config";
import { normalizeDriverDefaults, normalizeTeamDefaults } from "./defaults";
import type { Contract, JuniorState, NormalizedUniverse, SeasonArchive, Team, Universe, WorldConfig } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertUniverseShape(value: unknown): asserts value is Universe {
  if (!isRecord(value) || !isRecord(value.season) || !Array.isArray(value.season.drivers) || !Array.isArray(value.season.teams)) {
    throw new Error("Invalid F1 SIM universe data.");
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new Error("Unsupported F1 SIM universe schema.");
}

function teamPositions(teams: Team[]): Map<string, number> {
  const performance = (team: Team) => {
    const values = [team.ratings.power, team.ratings.aerodynamics, team.ratings.mechanicalGrip, team.ratings.tirePreservation, team.ratings.reliability, team.ratings.pitCrew, team.ratings.strategy];
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  return new Map([...teams].sort((a, b) => performance(b) - performance(a) || a.id.localeCompare(b.id)).map((team, index) => [team.id, index + 1]));
}

function normalizeContracts(contracts: Contract[], currentSeason: number): Contract[] {
  return contracts.map((source) => {
    const contract = structuredClone(source);
    contract.startSeason = Math.max(0, Math.round(Number.isFinite(contract.startSeason) ? contract.startSeason : currentSeason));
    contract.endSeason = Math.max(contract.startSeason, Math.round(Number.isFinite(contract.endSeason) ? contract.endSeason : contract.startSeason));
    contract.effectiveSeason = Math.min(contract.endSeason, Math.max(contract.startSeason, Math.round(Number.isFinite(contract.effectiveSeason) ? contract.effectiveSeason! : contract.startSeason)));
    contract.salaryCredits = Math.max(0, Math.round(Number.isFinite(contract.salaryCredits) ? contract.salaryCredits : 0));
    contract.buyoutCredits = Math.max(0, Math.round(Number.isFinite(contract.buyoutCredits) ? contract.buyoutCredits : 0));
    contract.optionYears = Math.max(0, Math.round(Number.isFinite(contract.optionYears) ? contract.optionYears : 0));
    if (contract.endSeason < currentSeason && (contract.status === "active" || contract.status === "agreed")) contract.status = "expired";
    contract.origin ??= "migration";
    contract.decidedAt ??= `${String(contract.startSeason).padStart(4, "0")}-01-01T00:00:00.000Z`;
    return contract;
  });
}

function normalizeArchive(archive: SeasonArchive, baseSeed: number): SeasonArchive {
  const copy = structuredClone(archive);
  const activeDriverIds = new Set(copy.teams.flatMap((team) => team.driverIds));
  const positions = teamPositions(copy.teams);
  copy.teams = copy.teams.map((team) => normalizeTeamDefaults(team, baseSeed, positions.get(team.id) ?? copy.teams.length, copy.teams.length));
  copy.drivers = copy.drivers.map((driver) => normalizeDriverDefaults(driver, baseSeed, activeDriverIds.has(driver.id)));
  copy.managementEvents ??= [];
  copy.aiDecisions ??= [];
  copy.driverChampionId ??= copy.driverStandings[0]?.driverId;
  copy.constructorChampionId ??= copy.teamStandings[0]?.teamId;
  return copy;
}

function normalizeJuniorState(input: JuniorState | undefined, universe: Universe): JuniorState {
  const driverIds = new Set(universe.season.drivers.map((driver) => driver.id));
  const byStatus = (status: string) => universe.season.drivers.filter((driver) => driver.status === status).map((driver) => driver.id);
  const valid = (ids: string[] | undefined) => [...new Set((ids ?? []).filter((id) => driverIds.has(id)))];
  const academyDriverIdsByTeam = Object.fromEntries(universe.season.teams.map((team) => [
    team.id,
    valid(input?.academyDriverIdsByTeam?.[team.id]),
  ]));
  return {
    season: universe.season.year,
    f3DriverIds: valid(input?.f3DriverIds ?? byStatus("f3")),
    f2DriverIds: valid(input?.f2DriverIds ?? byStatus("f2")),
    reserveDriverIds: valid(input?.reserveDriverIds ?? byStatus("reserve")),
    academyDriverIdsByTeam,
    incomingClassDriverIds: valid(input?.incomingClassDriverIds),
  };
}

/**
 * Upgrade persisted data to the current in-memory contract. This function is
 * deliberately deterministic and idempotent so it is safe at every load and
 * import boundary, not only during a one-time database upgrade.
 */
export function normalizeUniverse(input: unknown): NormalizedUniverse {
  assertUniverseShape(input);
  const universe = structuredClone(input);
  const activeDriverIds = new Set(universe.season.teams.flatMap((team) => team.driverIds));
  const positions = teamPositions(universe.season.teams);
  universe.season.teams = universe.season.teams.map((team) => normalizeTeamDefaults(team, universe.baseSeed, positions.get(team.id) ?? universe.season.teams.length, universe.season.teams.length));
  universe.season.drivers = universe.season.drivers.map((driver) => normalizeDriverDefaults(driver, universe.baseSeed, activeDriverIds.has(driver.id)));
  universe.season.contracts = normalizeContracts(universe.season.contracts ?? [], universe.season.year);
  universe.seasonHistory = (universe.seasonHistory ?? []).map((archive) => normalizeArchive(archive, universe.baseSeed));
  universe.worldConfig = normalizeWorldConfig(universe.worldConfig as Partial<WorldConfig> | undefined);
  universe.aiDecisions ??= [];
  universe.managementEvents ??= [];
  universe.juniorState = normalizeJuniorState(universe.juniorState, universe);
  universe.schemaVersion = 2;
  return universe as NormalizedUniverse;
}

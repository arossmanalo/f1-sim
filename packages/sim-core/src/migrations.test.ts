import { describe, expect, it } from "vitest";
import { PRESET_2005, createUniverse, normalizeUniverse } from "./index";
import type { Driver, Team, Universe } from "./types";

function stripDriverV2(driver: Driver): void {
  delete driver.potentialMin;
  delete driver.potentialMax;
  delete driver.developmentRate;
  delete driver.generatedDriver;
  delete driver.countryCode;
  delete driver.status;
  delete driver.careerPhase;
  delete driver.archetype;
  delete driver.advancedRatings;
  delete driver.personality;
  delete driver.careerStats;
  delete driver.reputation;
  delete driver.financialBackingCredits;
  delete driver.sponsorshipValue;
}

function stripTeamV2(team: Team): void {
  delete team.reputation;
  delete team.budgetCredits;
  delete team.driverBudgetCredits;
  delete team.developmentQuality;
  delete team.academyQuality;
  delete team.facilities;
  delete team.scoutingQuality;
  delete team.philosophy;
  delete team.strategyState;
  delete team.riskTolerance;
  delete team.prestige;
  delete team.championshipExpectations;
  delete team.careerStats;
}

describe("universe model migration", () => {
  it("creates deterministic, save-owned autonomous-world defaults", () => {
    const first = normalizeUniverse(createUniverse(PRESET_2005, { seed: 4455 }));
    const second = normalizeUniverse(createUniverse(PRESET_2005, { seed: 4455 }));
    expect(first.schemaVersion).toBe(2);
    expect(first.season.drivers[0]?.personality).toEqual(second.season.drivers[0]?.personality);
    expect(first.season.teams[0]?.budgetCredits).toBe(second.season.teams[0]?.budgetCredits);
    expect(first.season.drivers.every((driver) => driver.potentialMin <= driver.potential && driver.potential <= driver.potentialMax)).toBe(true);
    first.worldConfig.market.maximumRounds = 99;
    expect(second.worldConfig.market.maximumRounds).not.toBe(99);
  });

  it("idempotently upgrades v1 current state, contracts, and archive snapshots", () => {
    const source = createUniverse(PRESET_2005, { seed: 9988 });
    const legacy = structuredClone(source) as Universe;
    legacy.schemaVersion = 1;
    legacy.season.year = 2008;
    legacy.seasonHistory = [{
      year: 2007,
      drivers: structuredClone(legacy.season.drivers),
      teams: structuredClone(legacy.season.teams),
      completedWeekends: [],
      driverStandings: structuredClone(legacy.season.driverStandings),
      teamStandings: structuredClone(legacy.season.teamStandings),
    }];
    delete legacy.worldConfig;
    delete legacy.juniorState;
    delete legacy.aiDecisions;
    delete legacy.managementEvents;
    legacy.season.drivers.forEach(stripDriverV2);
    legacy.season.teams.forEach(stripTeamV2);
    legacy.seasonHistory[0]!.drivers.forEach(stripDriverV2);
    legacy.seasonHistory[0]!.teams.forEach(stripTeamV2);
    const contract = legacy.season.contracts[0]!;
    contract.endSeason = 2007;
    contract.status = "active";
    delete contract.effectiveSeason;
    delete contract.origin;
    delete contract.decidedAt;
    const visiblePotential = legacy.season.drivers[0]!.potential;

    const migrated = normalizeUniverse(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.season.drivers[0]!.potential).toBe(visiblePotential);
    expect(migrated.season.drivers[0]!.personality.workEthic).toBeGreaterThanOrEqual(0);
    expect(migrated.season.teams[0]!.philosophy).toBeTruthy();
    expect(migrated.season.contracts[0]!.status).toBe("expired");
    expect(migrated.season.contracts[0]!.effectiveSeason).toBe(contract.startSeason);
    expect(migrated.seasonHistory[0]!.drivers[0]!.careerStats).toBeDefined();
    expect(migrated.seasonHistory[0]!.teams[0]!.careerStats).toBeDefined();
    expect(normalizeUniverse(migrated)).toEqual(migrated);
  });
});

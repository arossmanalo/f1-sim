import { describe, expect, it } from "vitest";
import { createUniverse, simulateAutonomousSeasons } from "./index";
import { PRESET_2026 } from "./presets";

function shortPreset() {
  const preset = structuredClone(PRESET_2026);
  preset.weekends = [preset.weekends[0]!];
  return preset;
}

function projection(universe: ReturnType<typeof simulateAutonomousSeasons>) {
  return {
    year: universe.season.year,
    history: universe.seasonHistory.map((archive) => ({ year: archive.year, champion: archive.driverChampionId, constructor: archive.constructorChampionId })),
    grid: universe.season.teams.map((team) => [team.id, team.driverIds]),
    ratings: universe.season.teams.map((team) => [team.id, team.ratings.power, team.ratings.aerodynamics, team.ratings.reliability]),
    drivers: universe.season.drivers.map((driver) => [driver.id, driver.age, driver.status, driver.potential, driver.ratings.racePace]),
  };
}

describe("autonomous dynasty seasons", () => {
  it("runs multiple seasons without manual offseason approval", () => {
    const source = createUniverse(shortPreset(), { mode: "dynasty", seed: 90210 });
    const result = simulateAutonomousSeasons(source, 5);
    expect(result.season.year).toBe(2031);
    expect(result.season.phase).toBe("preseason");
    expect(result.seasonHistory).toHaveLength(5);
    expect(result.season.teams.every((team) => team.driverIds.length === 2)).toBe(true);
    expect(new Set(result.season.teams.flatMap((team) => team.driverIds)).size).toBe(result.season.teams.length * 2);
    expect(result.managementEvents.length).toBeGreaterThan(0);
    expect(result.aiDecisions.length).toBeGreaterThan(0);
    expect(result.season.drivers.some((driver) => driver.generatedDriver)).toBe(true);
  });

  it("is deterministic for the same universe seed and action count", () => {
    const first = simulateAutonomousSeasons(createUniverse(shortPreset(), { mode: "dynasty", seed: 44 }), 3);
    const second = simulateAutonomousSeasons(createUniverse(shortPreset(), { mode: "dynasty", seed: 44 }), 3);
    expect(projection(first)).toEqual(projection(second));
  });

  it("handles the full 24-round calendar without exhausting the simulation path", () => {
    const result = simulateAutonomousSeasons(createUniverse(PRESET_2026, { mode: "dynasty", seed: 20260913 }), 1);
    expect(result.season.year).toBe(2027);
    expect(result.seasonHistory).toHaveLength(1);
    expect(result.season.teams.every((team) => team.driverIds.length === 2)).toBe(true);
  }, 15_000);
});

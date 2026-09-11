import { describe, expect, it } from "vitest";
import { PRESET_2005, PRESET_2026, approveOffseason, applyInSeasonDevelopment, createUniverse, fastForwardSeason, moveDriver, proposeOffseason, validatePreset } from "./index";

describe("dynasty progression", () => {
  it("pauses for an offseason package and starts the approved next season cleanly", () => {
    const preset = structuredClone(PRESET_2005);
    preset.weekends = [preset.weekends[0]!];
    expect(validatePreset(preset)).toEqual([]);

    let universe = createUniverse(preset, { mode: "dynasty", seed: 99 });
    universe = fastForwardSeason(universe);
    expect(universe.season.phase).toBe("season-complete");
    expect(universe.season.completedWeekends).toHaveLength(1);

    universe = proposeOffseason(universe);
    expect(universe.season.phase).toBe("offseason");
    expect(universe.season.offseasonProposal?.status).toBe("pending");
    expect(universe.season.offseasonProposal?.rookies?.length).toBeGreaterThanOrEqual(2);

    const firstDriverBefore = universe.season.drivers[0]!;
    universe = approveOffseason(universe);
    expect(universe.season.year).toBe(2006);
    expect(universe.season.phase).toBe("preseason");
    expect(universe.season.completedWeekends).toEqual([]);
    expect(universe.season.rulesLocked).toBe(false);
    expect(universe.seasonHistory).toHaveLength(1);
    expect(universe.seasonHistory?.[0]?.year).toBe(2005);
    expect(universe.seasonHistory?.[0]?.completedWeekends).toHaveLength(1);
    const firstDriverAfter = universe.season.drivers.find((driver) => driver.id === firstDriverBefore.id)!;
    expect(firstDriverAfter.age).toBe(firstDriverBefore.age + 1);
    expect(firstDriverAfter.ratings.racePace).not.toBe(firstDriverBefore.ratings.racePace);
    const rookie = universe.season.drivers.find((driver) => driver.evidence.source === "Generated rookie pool")!;
    expect(rookie.potential).toBeGreaterThanOrEqual(0);
    expect(universe.season.teams.every((team) => !team.driverIds.includes(rookie.id))).toBe(true);
    universe = moveDriver(universe, rookie.id, universe.season.teams[0]!.id, 1);
    expect(universe.season.teams[0]!.driverIds).toContain(rookie.id);
  });

  it("applies deterministic development packages between weekends", () => {
    const preset = structuredClone(PRESET_2005);
    preset.weekends = [preset.weekends[0]!, preset.weekends[1]!];
    const candidates = Array.from({ length: 40 }, (_, index) => {
      const candidate = createUniverse(preset, { seed: index + 1 });
      candidate.season.phase = "between-weekends";
      return applyInSeasonDevelopment(candidate);
    });
    expect(candidates.some((candidate) => (candidate.season.teamUpgrades ?? []).length > 0)).toBe(true);
    const first = createUniverse(preset, { seed: 99 });
    first.season.phase = "between-weekends";
    const second = structuredClone(first);
    const a = applyInSeasonDevelopment(first);
    const b = applyInSeasonDevelopment(second);
    expect(a.season.teamUpgrades).toEqual(b.season.teamUpgrades);
  });

  it("ages and evolves a dynasty roster across ten seasons", () => {
    const preset = structuredClone(PRESET_2026);
    preset.weekends = [preset.weekends[0]!];
    let universe = createUniverse(preset, { mode: "dynasty", seed: 2026 });
    const hamilton = universe.season.drivers.find((driver) => driver.code === "HAM")!;
    const startingAge = hamilton.age;
    const startingPace = hamilton.ratings.racePace;
    for (let season = 0; season < 10; season += 1) {
      universe = proposeOffseason(fastForwardSeason(universe));
      universe = approveOffseason(universe);
    }
    const evolved = universe.season.drivers.find((driver) => driver.code === "HAM")!;
    expect(evolved.age).toBe(startingAge + 10);
    expect(evolved.ratings.racePace).not.toBe(startingPace);
    expect(universe.seasonHistory).toHaveLength(10);
    expect(universe.season.drivers.filter((driver) => driver.evidence.source === "Generated rookie pool").length).toBeGreaterThanOrEqual(20);
  });
});

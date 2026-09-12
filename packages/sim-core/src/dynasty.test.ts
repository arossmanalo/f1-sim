import { describe, expect, it } from "vitest";
import { PRESET_2005, PRESET_2026, DeterministicRng, addCustomDriver, advanceSeasonPhase, approveOffseason, applyInSeasonDevelopment, createUniverse, editOffseasonRating, fastForwardSeason, moveDriver, progressDriverForNextSeason, proposeOffseason, resetTeamRatingsForNextSeason, validatePreset } from "./index";

describe("dynasty progression", () => {
  it("advances through preseason, season, and an editable offseason package", () => {
    const preset = structuredClone(PRESET_2005);
    preset.weekends = [preset.weekends[0]!];
    let universe = createUniverse(preset, { mode: "dynasty", seed: 7 });
    expect(universe.season.phase).toBe("preseason");
    universe = advanceSeasonPhase(universe);
    expect(universe.season.phase).toBe("between-weekends");
    universe = advanceSeasonPhase(fastForwardSeason(universe));
    expect(universe.season.phase).toBe("offseason");
    const change = universe.season.offseasonProposal!.ratingChanges[0]!;
    universe = editOffseasonRating(universe, change.teamId, change.field, 8);
    expect(universe.season.offseasonProposal!.ratingChanges[0]!.delta).toBe(8);
    universe = advanceSeasonPhase(universe);
    expect(universe.season.phase).toBe("preseason");
  });

  it("rebases team ratings and keeps custom drivers unattached", () => {
    const universe = createUniverse(PRESET_2005, { seed: 8 });
    universe.season.teams.forEach((team) => { for (const field of Object.keys(team.ratings) as Array<keyof typeof team.ratings>) team.ratings[field] = 100; });
    const reset = resetTeamRatingsForNextSeason(universe);
    expect(reset.season.teams.some((team) => Object.values(team.ratings).some((rating) => rating < 100))).toBe(true);
    const source = reset.season.drivers[0]!;
    const custom = structuredClone(source);
    custom.id = "custom-test-driver";
    custom.code = "TST";
    custom.number = 999;
    custom.givenName = "Test";
    custom.familyName = "Driver";
    custom.potential = 99;
    const withDriver = addCustomDriver(reset, custom);
    expect(withDriver.season.drivers.find((driver) => driver.id === custom.id)?.potential).toBe(99);
    expect(withDriver.season.teams.every((team) => !team.driverIds.includes(custom.id))).toBe(true);
  });

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

  it("uses potential for young-driver growth and age for veteran decline", () => {
    const young = structuredClone(PRESET_2026.drivers[0]!);
    young.age = 20;
    young.potential = 99;
    young.ratings.racePace = 60;
    const lowCeiling = structuredClone(young);
    lowCeiling.potential = 64;
    const developed = progressDriverForNextSeason(young, new DeterministicRng(1234));
    const limited = progressDriverForNextSeason(lowCeiling, new DeterministicRng(1234));
    expect(developed.ratings.racePace).toBeGreaterThan(limited.ratings.racePace);

    const veteran = structuredClone(PRESET_2026.drivers.find((driver) => driver.code === "HAM")!);
    veteran.age = 40;
    veteran.potential = 99;
    const before = veteran.ratings.racePace;
    const declined = progressDriverForNextSeason(veteran, new DeterministicRng(1234));
    expect(declined.age).toBe(41);
    expect(declined.ratings.racePace).toBeLessThan(before);
  });
});

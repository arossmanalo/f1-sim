import { describe, expect, it } from "vitest";
import { createUniverse } from "./engine";
import { PRESET_2005 } from "./presets";
import { repairUniverseRosters, validateUniverseState } from "./world-validation";

describe("world roster validation", () => {
  it("detects a duplicated driver and repairs it from the eligible registry", () => {
    const universe = createUniverse(PRESET_2005, { mode: "dynasty", seed: 911 });
    const freeAgent = structuredClone(universe.season.drivers[0]!);
    freeAgent.id = "recovery-free-agent";
    freeAgent.code = "RCV";
    freeAgent.number = 900;
    freeAgent.status = "free-agent";
    universe.season.drivers.push(freeAgent);
    universe.season.teams[1]!.driverIds[0] = universe.season.teams[0]!.driverIds[0];
    expect(validateUniverseState(universe).some((issue) => issue.code === "DUPLICATE_ACTIVE_DRIVER")).toBe(true);
    const repaired = repairUniverseRosters(universe);
    expect(validateUniverseState(repaired)).toEqual([]);
    expect(new Set(repaired.season.teams.flatMap((team) => team.driverIds)).size).toBe(repaired.season.teams.length * 2);
  });

  it("removes retired occupants and terminates conflicting contracts", () => {
    const universe = createUniverse(PRESET_2005, { mode: "dynasty", seed: 912 });
    const retired = universe.season.drivers.find((driver) => driver.id === universe.season.teams[0]!.driverIds[0])!;
    retired.status = "retired";
    const replacement = structuredClone(universe.season.drivers[0]!);
    replacement.id = "available-replacement";
    replacement.code = "AVL";
    replacement.number = 901;
    replacement.status = "free-agent";
    universe.season.drivers.push(replacement);
    const repaired = repairUniverseRosters(universe);
    expect(repaired.season.teams.some((team) => team.driverIds.includes(retired.id))).toBe(false);
    expect(validateUniverseState(repaired)).toEqual([]);
  });
});


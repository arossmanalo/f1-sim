import { describe, expect, it } from "vitest";
import { PRESET_2005, approveOffseason, createUniverse, fastForwardSeason, proposeOffseason, validatePreset } from "./index";

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

    universe = approveOffseason(universe);
    expect(universe.season.year).toBe(2006);
    expect(universe.season.phase).toBe("preseason");
    expect(universe.season.completedWeekends).toEqual([]);
    expect(universe.season.rulesLocked).toBe(false);
  });
});

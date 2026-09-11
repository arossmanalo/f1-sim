import { describe, expect, it } from "vitest";
import {
  PRESET_2005,
  PRESET_2026,
  advanceLaps,
  applyIntervention,
  applyWorkshopEdits,
  createUniverse,
  exportUniverse,
  finalizeWeekend,
  finishSession,
  forkUniverse,
  getChampionshipClinch,
  importUniverse,
  rebuildStandings,
  startWeekend,
  validatePreset,
  voidLastWeekend,
} from "./index";
import type { SeasonPreset } from "./types";

function oneRound(preset: SeasonPreset): SeasonPreset {
  const copy = structuredClone(preset);
  copy.weekends = [copy.weekends[0]!];
  return copy;
}

function canonicalEvents(universe: ReturnType<typeof createUniverse>) {
  return universe.season.currentWeekend?.race.events.map(({ type, lap, message, driverIds, teamIds, factors }) => ({
    type,
    lap,
    message,
    driverIds,
    teamIds,
    factors,
  }));
}

describe("built-in vertical slices", () => {
  it.each([PRESET_2005, PRESET_2026])("validates $year with two unique active seats per team", (preset) => {
    expect(validatePreset(preset)).toEqual([]);
    expect(preset.teams.every((team) => team.driverIds.length === 2)).toBe(true);
    const seats = preset.teams.flatMap((team) => team.driverIds);
    expect(new Set(seats).size).toBe(seats.length);
  });

  it("models 2005 as a refueling season and 2026 with sprint weekends", () => {
    expect(PRESET_2005.ruleset.refueling).toBe(true);
    expect(PRESET_2026.ruleset.refueling).toBe(false);
    expect(PRESET_2026.weekends.filter((weekend) => weekend.sprint)).toHaveLength(6);
  });
});

describe("deterministic event engine", () => {
  it("replays the same seed into the same canonical result and event stream", () => {
    const preset = oneRound(PRESET_2005);
    const a = finishSession(startWeekend(createUniverse(preset, { seed: 2005 })));
    const b = finishSession(startWeekend(createUniverse(preset, { seed: 2005 })));

    expect(a.season.currentWeekend?.qualifying).toEqual(b.season.currentWeekend?.qualifying);
    expect(a.season.currentWeekend?.race.result).toEqual(b.season.currentWeekend?.race.result);
    expect(canonicalEvents(a)).toEqual(canonicalEvents(b));
    expect(a.season.currentWeekend?.race.events.filter((item) => item.type === "overtake").every((item) => item.message.includes("passes"))).toBe(true);
  });

  it("allows controlled variation when the seed changes", () => {
    const preset = oneRound(PRESET_2005);
    const a = finishSession(startWeekend(createUniverse(preset, { seed: 1 })));
    const b = finishSession(startWeekend(createUniverse(preset, { seed: 2 })));
    expect(a.season.currentWeekend?.qualifying).not.toEqual(b.season.currentWeekend?.qualifying);
  });

  it("records a confirmed intervention immediately and has no undo command", () => {
    let universe = startWeekend(createUniverse(oneRound(PRESET_2005), { seed: 7 }));
    universe = advanceLaps(universe, 2);
    const driverId = universe.season.currentWeekend!.race.cars[0]!.driverId;
    universe = applyIntervention(universe, {
      kind: "retire-driver",
      driverId,
      note: "Race director test retirement",
    });

    expect(universe.season.currentWeekend!.race.cars.find((car) => car.driverId === driverId)?.status).toBe("dnf");
    expect(universe.audit.at(-1)?.intervention?.driverId).toBe(driverId);
    expect(universe.audit.at(-1)?.summary).toBe("Race director test retirement");
  });

  it("keeps finalized results immutable and retains a voided result before rerunning", () => {
    let universe = createUniverse(oneRound(PRESET_2005), { seed: 11 });
    universe = finalizeWeekend(finishSession(startWeekend(universe)));
    const original = structuredClone(universe.season.completedWeekends[0]);
    universe = voidLastWeekend(universe);

    expect(universe.season.completedWeekends[0]?.voided).toBe(true);
    expect(universe.season.completedWeekends[0]?.race).toEqual(original?.race);
    expect(universe.season.currentWeekend?.race.status).toBe("running");
  });

  it("only branches at stable weekend boundaries", () => {
    const stable = createUniverse(oneRound(PRESET_2005), { seed: 44 });
    const active = startWeekend(stable);
    expect(() => forkUniverse(active)).toThrow(/between completed weekends/i);
    const branch = forkUniverse(stable, "Director cut");
    expect(branch.parentUniverseId).toBe(stable.id);
    expect(branch.name).toBe("Director cut");
  });

  it("round-trips versioned JSON backups", () => {
    const universe = createUniverse(oneRound(PRESET_2026), { seed: 2026 });
    expect(importUniverse(exportUniverse(universe))).toEqual(universe);
  });

  it("applies staged workshop edits as one audited command", () => {
    const universe = createUniverse(oneRound(PRESET_2005), { seed: 17 });
    const driver = universe.season.drivers[0]!;
    const team = universe.season.teams[0]!;
    const edited = applyWorkshopEdits(universe, {
      drivers: { [driver.id]: { racePace: 99 } },
      teams: { [team.id]: { strategy: 88 } },
    });
    expect(edited.season.drivers.find((item) => item.id === driver.id)?.ratings.racePace).toBe(99);
    expect(edited.season.teams.find((item) => item.id === team.id)?.ratings.strategy).toBe(88);
    expect(edited.audit.at(-1)?.action).toBe("apply-workshop-edits");
  });
});

describe("standings", () => {
  it("declares a driver and constructor champion only when no rival can catch them", () => {
    const universe = createUniverse(oneRound(PRESET_2005), { seed: 3 });
    const season = universe.season;
    season.currentRoundIndex = season.weekends.length;
    season.driverStandings = [
      { driverId: season.drivers[0]!.id, points: 26, wins: 1, podiums: 1, poles: 0, finishes: { 1: 1 } },
      { driverId: season.drivers[1]!.id, points: 25, wins: 1, podiums: 1, poles: 0, finishes: { 2: 1 } },
    ];
    season.teamStandings = [
      { teamId: season.teams[0]!.id, points: 50, wins: 1 },
      { teamId: season.teams[1]!.id, points: 49, wins: 1 },
    ];
    const clinch = getChampionshipClinch(season);
    expect(clinch.wdc.clinched).toBe(true);
    expect(clinch.wcc.clinched).toBe(true);

    season.currentRoundIndex = 0;
    expect(getChampionshipClinch(season).wdc.clinched).toBe(false);
  });

  it("awards sprint points without counting a sprint victory as a grand prix win", () => {
    const standings = rebuildStandings(["a", "b"], ["ta", "tb"], [{
      qualifying: [],
      sprint: [
        { position: 1, driverId: "a", teamId: "ta", grid: 1, laps: 20, elapsedMs: 1, gapMs: 0, status: "finished", points: 8 },
        { position: 2, driverId: "b", teamId: "tb", grid: 2, laps: 20, elapsedMs: 2, gapMs: 1, status: "finished", points: 7 },
      ],
      race: [
        { position: 1, driverId: "b", teamId: "tb", grid: 2, laps: 60, elapsedMs: 1, gapMs: 0, status: "finished", points: 25 },
        { position: 2, driverId: "a", teamId: "ta", grid: 1, laps: 60, elapsedMs: 2, gapMs: 1, status: "finished", points: 18 },
      ],
      voided: false,
    }]);

    expect(standings.drivers.find((driver) => driver.driverId === "a")?.wins).toBe(0);
    expect(standings.drivers.find((driver) => driver.driverId === "b")?.wins).toBe(1);
    expect(standings.teams.find((team) => team.teamId === "tb")?.wins).toBe(1);
  });
});

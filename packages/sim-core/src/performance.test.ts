import { describe, expect, it } from "vitest";
import { createUniverse } from "./engine";
import {
  DEFAULT_PERFORMANCE_CONFIG,
  evaluateSeasonPerformance,
  recalculateSeasonPerformance,
} from "./performance";
import { PRESET_2026 } from "./presets";
import type { CarState, CompletedWeekend, RaceResultEntry, Universe } from "./types";

function result(
  driverId: string,
  teamId: string,
  position: number,
  status: CarState["status"] = "finished",
  reason?: string,
  points = 0,
): RaceResultEntry {
  return {
    position,
    driverId,
    teamId,
    grid: position,
    laps: status === "dns" ? 0 : 58,
    elapsedMs: position * 1_000,
    gapMs: (position - 1) * 1_000,
    status,
    reason,
    points,
  };
}

function weekend(
  universe: Universe,
  round: number,
  options: {
    firstPosition?: number;
    secondPosition?: number;
    firstGrid?: number;
    secondGrid?: number;
    firstStatus?: CarState["status"];
    secondStatus?: CarState["status"];
    firstReason?: string;
    secondReason?: string;
    firstPoints?: number;
    secondPoints?: number;
  } = {},
): CompletedWeekend {
  const team = universe.season.teams[0]!;
  const [firstDriver, secondDriver] = team.driverIds;
  const firstPosition = options.firstPosition ?? 1;
  const secondPosition = options.secondPosition ?? 2;
  return {
    weekend: { id: `test-round-${round}`, round, name: `Test GP ${round}`, circuitId: universe.season.circuits[0]!.id, sprint: false },
    qualifying: [
      result(firstDriver, team.id, options.firstGrid ?? firstPosition),
      result(secondDriver, team.id, options.secondGrid ?? secondPosition),
    ],
    race: [
      result(firstDriver, team.id, firstPosition, options.firstStatus, options.firstReason, options.firstPoints),
      result(secondDriver, team.id, secondPosition, options.secondStatus, options.secondReason, options.secondPoints),
    ],
    events: [],
    finalizedAt: "2026-01-01T00:00:00.000Z",
    voided: false,
  };
}

function universeWith(...rounds: Array<(universe: Universe) => CompletedWeekend>): Universe {
  const universe = createUniverse(PRESET_2026, { seed: 617, name: "Performance test" });
  universe.season.completedWeekends = rounds.map((build) => build(universe));
  return universe;
}

describe("season performance evaluation", () => {
  it("separates mechanical failures from driver incidents and only counts the valid race comparison", () => {
    const mechanicalUniverse = universeWith((universe) => weekend(universe, 1, {
      firstPosition: 20,
      secondPosition: 4,
      firstStatus: "dnf",
      firstReason: "power unit failure",
    }));
    const incidentUniverse = universeWith((universe) => weekend(universe, 1, {
      firstPosition: 20,
      secondPosition: 4,
      firstStatus: "dnf",
      firstReason: "driver-caused collision",
    }));
    const driverId = mechanicalUniverse.season.teams[0]!.driverIds[0];
    const mechanical = evaluateSeasonPerformance(mechanicalUniverse).drivers[driverId]!;
    const incident = evaluateSeasonPerformance(incidentUniverse).drivers[driverId]!;

    expect(mechanical.mechanicalDnfs).toBe(1);
    expect(mechanical.driverIncidents).toBe(0);
    expect(mechanical.weekends[0]!.relativeToMachinery.eligible).toBe(false);
    expect(mechanical.weekends[0]!.relativeToMachinery.exclusionReason).toBe("mechanical-dnf");
    expect(mechanical.weekends[0]!.teammateComparison.raceEligible).toBe(false);

    expect(incident.mechanicalDnfs).toBe(0);
    expect(incident.driverIncidents).toBe(1);
    expect(incident.weekends[0]!.relativeToMachinery.eligible).toBe(true);
    expect(incident.weekends[0]!.teammateComparison.raceEligible).toBe(true);
    expect(incident.weekends[0]!.weekendScore).toBeLessThan(mechanical.weekends[0]!.weekendScore);
  });

  it("excludes DNS and DQ samples from race head-to-heads", () => {
    const universe = universeWith((current) => weekend(current, 1, {
      firstPosition: 20,
      secondPosition: 19,
      firstStatus: "dns",
      secondStatus: "dq",
    }));
    const [firstDriver, secondDriver] = universe.season.teams[0]!.driverIds;
    const performance = evaluateSeasonPerformance(universe);

    expect(performance.drivers[firstDriver]!.raceHeadToHead).toEqual({ wins: 0, losses: 0, ties: 0 });
    expect(performance.drivers[secondDriver]!.raceHeadToHead).toEqual({ wins: 0, losses: 0, ties: 0 });
    expect(performance.drivers[firstDriver]!.weekends[0]!.teammateComparison.raceEligible).toBe(false);
  });

  it("keeps arithmetic season averages and a five-race rolling form window", () => {
    const universe = universeWith(
      (current) => weekend(current, 1, { firstPosition: 1, firstGrid: 1, secondPosition: 10, secondGrid: 10 }),
      (current) => weekend(current, 2, { firstPosition: 3, firstGrid: 3, secondPosition: 10, secondGrid: 10 }),
      (current) => weekend(current, 3, { firstPosition: 9, firstGrid: 9, secondPosition: 10, secondGrid: 10 }),
      (current) => weekend(current, 4, { firstPosition: 4, firstGrid: 4, secondPosition: 10, secondGrid: 10 }),
      (current) => weekend(current, 5, { firstPosition: 5, firstGrid: 5, secondPosition: 10, secondGrid: 10 }),
      (current) => weekend(current, 6, { firstPosition: 6, firstGrid: 6, secondPosition: 10, secondGrid: 10 }),
    );
    const driverId = universe.season.teams[0]!.driverIds[0];
    const review = evaluateSeasonPerformance(universe).drivers[driverId]!;
    const meanWeekendScore = review.weekends.reduce((sum, entry) => sum + entry.weekendScore, 0) / review.weekends.length;
    const recentMean = review.weekends.slice(-5).reduce((sum, entry) => sum + entry.weekendScore, 0) / 5;
    const baselineForm = universe.season.drivers.find((driver) => driver.id === driverId)!.form;

    expect(review.averageQualifyingPosition).toBeCloseTo(28 / 6, 8);
    expect(review.averageFinishingPosition).toBeCloseTo(28 / 6, 8);
    expect(review.averageWeekendScore).toBeCloseTo(meanWeekendScore, 8);
    expect(review.rollingForm).toBeCloseTo(
      baselineForm * DEFAULT_PERFORMANCE_CONFIG.formBaselineWeight
        + recentMean * (1 - DEFAULT_PERFORMANCE_CONFIG.formBaselineWeight),
      8,
    );
  });

  it("honors teammate subweights and caps every confidence change", () => {
    const universe = universeWith((current) => weekend(current, 1, {
      firstPosition: 12,
      secondPosition: 1,
      firstGrid: 1,
      secondGrid: 12,
      firstPoints: 0,
      secondPoints: 25,
    }));
    const driverId = universe.season.teams[0]!.driverIds[0];
    const config = {
      ...DEFAULT_PERFORMANCE_CONFIG,
      teammateQualifyingWeight: 1,
      teammateRaceWeight: 0,
      teammatePointsWeight: 0,
      maximumConfidenceMovementPerRace: 0.75,
    };
    const entry = evaluateSeasonPerformance(universe, config).drivers[driverId]!.weekends[0]!;

    expect(entry.teammateComparison.score).toBeGreaterThan(50);
    expect(Math.abs(entry.confidenceDelta)).toBeLessThanOrEqual(0.75);
  });

  it("is deterministic, ignores voided weekends, and is idempotent when recalculated", () => {
    const universe = universeWith(
      (current) => weekend(current, 1, { firstPosition: 2, secondPosition: 6 }),
      (current) => ({ ...weekend(current, 2, { firstPosition: 20, secondPosition: 1 }), voided: true }),
    );
    const before = structuredClone(universe);
    expect(evaluateSeasonPerformance(universe)).toEqual(evaluateSeasonPerformance(structuredClone(universe)));
    expect(universe).toEqual(before);

    const once = recalculateSeasonPerformance(universe);
    const twice = recalculateSeasonPerformance(once);
    expect(twice.season.performance).toEqual(once.season.performance);
    expect(twice.season.drivers).toEqual(once.season.drivers);
    expect(twice.season.performance!.evaluatedThroughRound).toBe(1);
  });
});

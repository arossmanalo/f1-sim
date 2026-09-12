import { describe, expect, it } from "vitest";
import { createUniverse } from "./engine";
import { PRESET_2005 } from "./presets";
import { calculateTeamPerformance, evolveTeamsForNextSeason } from "./team-development";

describe("autonomous constructor development", () => {
  it("is deterministic, bounded, and lets the back of the field close a large gap", () => {
    const source = createUniverse(PRESET_2005, { mode: "dynasty", seed: 9081 });
    source.season.teamStandings = source.season.teams.map((team, index) => ({
      teamId: team.id,
      points: (source.season.teams.length - index) * 30,
      wins: index === 0 ? 8 : 0,
    }));
    const leader = source.season.teams[0]!;
    const last = source.season.teams.at(-1)!;
    for (const key of ["power", "aerodynamics", "mechanicalGrip", "tirePreservation", "reliability", "pitCrew", "strategy"] as const) {
      leader.ratings[key] = 98;
      last.ratings[key] = 58;
    }
    const beforeGap = calculateTeamPerformance(leader) - calculateTeamPerformance(last);
    const first = evolveTeamsForNextSeason(source, 2006);
    const second = evolveTeamsForNextSeason(source, 2006);
    expect(first.outcomes).toEqual(second.outcomes);
    const nextLeader = first.universe.season.teams.find((team) => team.id === leader.id)!;
    const nextLast = first.universe.season.teams.find((team) => team.id === last.id)!;
    expect(calculateTeamPerformance(nextLeader) - calculateTeamPerformance(nextLast)).toBeLessThan(beforeGap);
    expect(first.universe.season.teams.every((team) => Object.values(team.ratings).every((value) => value >= 0 && value <= 100))).toBe(true);
  });

  it("allows improvement and regression without naming or favoring a constructor", () => {
    const source = createUniverse(PRESET_2005, { mode: "dynasty", seed: 4402 });
    source.season.teamStandings = source.season.teams.map((team, index) => ({ teamId: team.id, points: 100 - index * 8, wins: 0 }));
    const result = evolveTeamsForNextSeason(source, 2006);
    expect(result.outcomes.some((outcome) => outcome.nextOverall > outcome.previousOverall)).toBe(true);
    expect(result.outcomes.some((outcome) => outcome.nextOverall < outcome.previousOverall)).toBe(true);
    expect(result.universe.managementEvents.filter((event) => event.type === "development")).toHaveLength(source.season.teams.length);
  });
});


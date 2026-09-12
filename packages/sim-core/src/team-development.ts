import { DeterministicRng, hashSeed } from "./rng";
import { clampRating } from "./defaults";
import { normalizeUniverse } from "./migrations";
import type { ManagementEvent, NormalizedUniverse, TeamPerformanceField, TeamStrategyState, Universe } from "./types";

const PERFORMANCE_FIELDS: TeamPerformanceField[] = [
  "power",
  "aerodynamics",
  "mechanicalGrip",
  "tirePreservation",
  "reliability",
  "pitCrew",
  "strategy",
];

export interface TeamDevelopmentOutcome {
  teamId: string;
  previousOverall: number;
  nextOverall: number;
  changes: Partial<Record<TeamPerformanceField, number>>;
  breakthrough: boolean;
  setback: boolean;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

export function calculateTeamPerformance(team: Universe["season"]["teams"][number]): number {
  return average(PERFORMANCE_FIELDS.map((field) => team.ratings[field]));
}

export function classifyTeamStrategy(
  performanceRank: number,
  teamCount: number,
  budgetCredits: number,
  expectedPosition: number,
): TeamStrategyState {
  if (budgetCredits < 45_000) return "FINANCIAL_DIFFICULTY";
  const percentile = teamCount <= 1 ? 0 : (performanceRank - 1) / (teamCount - 1);
  if (percentile <= 0.08 && expectedPosition <= 2) return "DOMINANT";
  if (percentile <= 0.25) return "TITLE_CONTENDER";
  if (percentile <= 0.45) return "CONTENDING";
  if (percentile <= 0.7) return "MIDFIELD";
  return expectedPosition <= Math.ceil(teamCount * 0.55) ? "REBUILDING" : "DEVELOPING";
}

function deterministicTimestamp(season: number, teamIndex: number): string {
  return new Date(Date.UTC(season, 0, 2, 0, teamIndex)).toISOString();
}

/**
 * Run an offseason constructor cycle without scripting a winner. Previous car
 * quality supplies momentum, field convergence and resource allocation give
 * trailing teams a route back, and organization quality plus seeded project
 * outcomes determine whether that opportunity is converted.
 */
export function evolveTeamsForNextSeason(input: Universe, targetSeason = input.season.year + 1): {
  universe: NormalizedUniverse;
  outcomes: TeamDevelopmentOutcome[];
} {
  return evolveTeamsForNextSeasonInPlace(normalizeUniverse(input), targetSeason);
}

/** Evolve an already-normalized universe without cloning its historical archive. */
export function evolveTeamsForNextSeasonInPlace(input: NormalizedUniverse, targetSeason = input.season.year + 1): {
  universe: NormalizedUniverse;
  outcomes: TeamDevelopmentOutcome[];
} {
  const universe = input;
  const standings = [...universe.season.teamStandings].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.teamId.localeCompare(b.teamId),
  );
  const rankByTeam = new Map(standings.map((standing, index) => [standing.teamId, index + 1]));
  const fieldMeans = Object.fromEntries(PERFORMANCE_FIELDS.map((field) => [
    field,
    average(universe.season.teams.map((team) => team.ratings[field])),
  ])) as Record<TeamPerformanceField, number>;
  const denominator = Math.max(1, universe.season.teams.length - 1);
  const outcomes: TeamDevelopmentOutcome[] = [];

  universe.season.teams.forEach((team, teamIndex) => {
    const rank = rankByTeam.get(team.id) ?? universe.season.teams.length;
    const trailingFactor = (rank - 1) / denominator;
    const organization = (team.developmentQuality + team.facilities) / 2;
    const projectRng = new DeterministicRng(hashSeed(universe.baseSeed, targetSeason, "constructor-cycle", team.id));
    const breakthroughChance = 0.018 + trailingFactor * 0.055 + Math.max(0, organization - 82) / 1_500;
    const setbackChance = 0.035 + Math.max(0, 70 - organization) / 1_000;
    const breakthrough = projectRng.chance(breakthroughChance);
    const setback = !breakthrough && projectRng.chance(setbackChance);
    const previousOverall = calculateTeamPerformance(team);
    const changes: Partial<Record<TeamPerformanceField, number>> = {};

    for (const field of PERFORMANCE_FIELDS) {
      const previous = team.ratings[field];
      // Only part of the gap closes each winter; this creates catch-up without
      // awarding the title to the previous last-place team.
      const convergence = (fieldMeans[field] - previous) * 0.14;
      const resourceAllocation = (trailingFactor - 0.5) * 2.8;
      const execution = (organization - 72) * 0.035;
      const riskScale = 0.7 + team.riskTolerance / 125;
      const variation = projectRng.between(-2.25, 2.25) * riskScale * universe.randomness.developmentVariance;
      const projectShock = breakthrough
        ? projectRng.between(2.5, 5.5)
        : setback
          ? -projectRng.between(2.5, 5.5)
          : 0;
      const rawDelta = convergence + resourceAllocation + execution + variation + projectShock;
      const delta = Math.max(-8, Math.min(8, Math.round(rawDelta)));
      team.ratings[field] = clampRating(previous + delta);
      changes[field] = team.ratings[field] - previous;
    }

    const priorPotential = team.ratings.developmentPotential;
    team.ratings.developmentPotential = clampRating(
      priorPotential * 0.68 + organization * 0.24 + (60 + trailingFactor * 24) * 0.08 + projectRng.between(-2, 2),
    );

    // Prize income rewards results, while commercial base and sponsorship keep
    // every organization solvent enough to field two drivers. Spending power
    // varies, but an F1 seat can never disappear only because a team finished last.
    const performanceIncome = Math.round((universe.season.teams.length - rank + 1) * 4_000);
    const commercialIncome = Math.round(34_000 + team.prestige * 380);
    const operatingCost = Math.round(42_000 + organization * 240);
    team.budgetCredits = Math.max(45_000, team.budgetCredits + performanceIncome + commercialIncome - operatingCost);
    const budgetShare = team.philosophy === "financial-survival" ? 0.14 : team.philosophy === "championship" ? 0.24 : 0.2;
    team.driverBudgetCredits = Math.max(12_000, Math.min(team.budgetCredits, Math.round(team.budgetCredits * budgetShare)));
    const nextOverall = calculateTeamPerformance(team);
    team.reputation = clampRating(team.reputation * 0.84 + (100 - (rank - 1) * (70 / denominator)) * 0.16);
    team.prestige = clampRating(team.prestige * 0.9 + team.reputation * 0.1);
    team.strategyState = classifyTeamStrategy(rank, universe.season.teams.length, team.budgetCredits, team.championshipExpectations);

    const outcome: TeamDevelopmentOutcome = {
      teamId: team.id,
      previousOverall,
      nextOverall,
      changes,
      breakthrough,
      setback,
    };
    outcomes.push(outcome);
    const direction = nextOverall >= previousOverall ? "improved" : "regressed";
    const event: ManagementEvent = {
      id: `management-development-${targetSeason}-${team.id}`,
      season: targetSeason,
      type: "development",
      summary: `${team.name} ${direction} from ${previousOverall.toFixed(1)} to ${nextOverall.toFixed(1)}${breakthrough ? " after a breakthrough project" : setback ? " after a failed concept" : " during its winter programme"}.`,
      driverIds: [],
      teamIds: [team.id],
      createdAt: deterministicTimestamp(targetSeason, teamIndex),
    };
    universe.managementEvents.push(event);
  });

  return { universe, outcomes };
}

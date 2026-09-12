import { DeterministicRng, hashSeed } from "./rng";
import type {
  Driver,
  DriverArchetype,
  DriverCareerPhase,
  DriverCareerStats,
  DriverPersonality,
  DriverStatus,
  NormalizedDriver,
  NormalizedTeam,
  Team,
  TeamCareerStats,
  TeamPhilosophy,
  TeamStrategyState,
} from "./types";

const driverRatingValues = (driver: Driver): number[] => Object.values(driver.ratings).filter(Number.isFinite);
const teamPerformanceValues = (team: Team): number[] => [team.ratings.power, team.ratings.aerodynamics, team.ratings.mechanicalGrip, team.ratings.tirePreservation, team.ratings.reliability, team.ratings.pitCrew, team.ratings.strategy];

export function clampRating(value: number, fallback = 50): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : fallback)));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 50;
}

export function deriveCareerPhase(age: number): DriverCareerPhase {
  if (age <= 19) return "early-development";
  if (age <= 23) return "rapid-development";
  if (age <= 27) return "early-prime";
  if (age <= 32) return "prime";
  if (age <= 35) return "late-prime";
  return "decline";
}

function generatedDriver(driver: Driver): boolean {
  if (typeof driver.generatedDriver === "boolean") return driver.generatedDriver;
  return /generated|rookie/i.test(driver.evidence?.source ?? "") || /^(rookie|generated)-/i.test(driver.id);
}

function defaultArchetype(driver: Driver, generated: boolean, potentialMax: number, rng: DeterministicRng): DriverArchetype {
  const ratingAverage = average(driverRatingValues(driver));
  if (generated && rng.chance(0.07)) return "pay-driver";
  if (driver.age <= 22 && potentialMax >= 94 && ratingAverage >= 72) return "prodigy";
  if (driver.age >= 35 && driver.ratings.experience >= 88) return "veteran-leader";
  if (driver.age >= 24 && potentialMax - ratingAverage >= 12) return "late-bloomer";
  if (driver.ratings.qualifyingPace >= ratingAverage + 4) return "qualifying-specialist";
  if (driver.ratings.tireManagement >= ratingAverage + 4) return "tire-whisperer";
  if (driver.ratings.wetWeather >= ratingAverage + 5) return "wet-weather-specialist";
  if (driver.ratings.overtaking >= ratingAverage + 4) return "aggressive-racer";
  if (driver.ratings.consistency >= ratingAverage + 4) return "consistent-driver";
  return generated && ratingAverage < 68 ? "development-project" : "all-rounder";
}

function defaultPersonality(driver: Driver, rng: DeterministicRng): DriverPersonality {
  const existing = driver.personality as Partial<DriverPersonality> | undefined;
  const value = (key: keyof DriverPersonality, fallback: number) => clampRating(existing?.[key] ?? fallback);
  return {
    ambition: value("ambition", rng.int(45, 88)),
    loyalty: value("loyalty", rng.int(30, 82)),
    aggression: value("aggression", Math.round((driver.ratings.overtaking + rng.int(25, 75)) / 2)),
    patience: value("patience", rng.int(30, 82)),
    riskTolerance: value("riskTolerance", rng.int(30, 82)),
    moneyMotivation: value("moneyMotivation", rng.int(25, 80)),
    teamwork: value("teamwork", rng.int(42, 88)),
    confidence: value("confidence", Math.round((driver.form + driver.morale) / 2)),
    workEthic: value("workEthic", rng.int(45, 92)),
    marketability: value("marketability", rng.int(35, 85)),
  };
}

export function emptyDriverCareerStats(existing?: Partial<DriverCareerStats>): DriverCareerStats {
  return {
    seasons: Math.max(0, Math.round(existing?.seasons ?? 0)),
    teamIds: [...new Set(existing?.teamIds ?? [])],
    raceStarts: Math.max(0, Math.round(existing?.raceStarts ?? 0)),
    wins: Math.max(0, Math.round(existing?.wins ?? 0)),
    podiums: Math.max(0, Math.round(existing?.podiums ?? 0)),
    poles: Math.max(0, Math.round(existing?.poles ?? 0)),
    fastestLaps: Math.max(0, Math.round(existing?.fastestLaps ?? 0)),
    points: Math.max(0, existing?.points ?? 0),
    championships: Math.max(0, Math.round(existing?.championships ?? 0)),
    bestChampionshipFinish: existing?.bestChampionshipFinish && existing.bestChampionshipFinish > 0 ? Math.round(existing.bestChampionshipFinish) : undefined,
    careerEarningsCredits: Math.max(0, Math.round(existing?.careerEarningsCredits ?? 0)),
  };
}

export function normalizeDriverDefaults(driver: Driver, baseSeed: number, active: boolean): NormalizedDriver {
  const next = structuredClone(driver);
  const rng = new DeterministicRng(hashSeed(baseSeed, "driver-defaults-v1", driver.id));
  const ratingAverage = average(driverRatingValues(next));
  const visiblePotential = clampRating(next.potential, ratingAverage);
  const potentialMin = Math.min(visiblePotential, clampRating(next.potentialMin ?? visiblePotential - rng.int(3, 8)));
  const potentialMax = Math.max(visiblePotential, clampRating(next.potentialMax ?? visiblePotential + rng.int(1, 5)));
  const isGenerated = generatedDriver(next);
  const archetype = next.archetype ?? defaultArchetype(next, isGenerated, potentialMax, rng);
  const existingStatus = next.status as DriverStatus | undefined;
  // Never resurrect a retired driver merely because a corrupted/stale seat
  // reference still points at them. Roster recovery must see the retirement
  // and replace that occupant explicitly.
  const status: DriverStatus = existingStatus === "retired" ? "retired" : active ? "f1" : existingStatus ?? "free-agent";
  const backing = Math.max(0, Math.round(next.financialBackingCredits ?? (archetype === "pay-driver" ? rng.int(4_000, 20_000) : 0)));

  return {
    ...next,
    potential: visiblePotential,
    potentialMin,
    potentialMax,
    developmentRate: Math.max(0.25, Math.min(2, next.developmentRate ?? rng.between(0.72, 1.28))),
    generatedDriver: isGenerated,
    countryCode: (next.countryCode ?? next.nationality ?? "UNK").toUpperCase().slice(0, 3),
    status,
    careerPhase: next.careerPhase ?? deriveCareerPhase(next.age),
    archetype,
    advancedRatings: {
      adaptability: clampRating(next.advancedRatings?.adaptability ?? average([next.ratings.consistency, next.ratings.wetWeather, next.ratings.cornering])),
      technicalFeedback: clampRating(next.advancedRatings?.technicalFeedback ?? average([next.ratings.experience, next.ratings.consistency, next.ratings.tireManagement])),
      pressureHandling: clampRating(next.advancedRatings?.pressureHandling ?? average([next.ratings.consistency, next.ratings.experience, 100 - next.pressure])),
    },
    personality: defaultPersonality(next, rng),
    careerStats: emptyDriverCareerStats(next.careerStats),
    reputation: clampRating(next.reputation ?? ratingAverage),
    financialBackingCredits: backing,
    sponsorshipValue: Math.max(0, Math.round(next.sponsorshipValue ?? backing * 0.4)),
  };
}

export function emptyTeamCareerStats(existing?: Partial<TeamCareerStats>): TeamCareerStats {
  return {
    constructorsChampionships: Math.max(0, Math.round(existing?.constructorsChampionships ?? 0)),
    raceWins: Math.max(0, Math.round(existing?.raceWins ?? 0)),
    podiums: Math.max(0, Math.round(existing?.podiums ?? 0)),
    driverChampionships: Math.max(0, Math.round(existing?.driverChampionships ?? 0)),
    seasonResults: structuredClone(existing?.seasonResults ?? []),
  };
}

function defaultTeamState(performance: number): TeamStrategyState {
  if (performance >= 94) return "DOMINANT";
  if (performance >= 88) return "TITLE_CONTENDER";
  if (performance >= 82) return "CONTENDING";
  if (performance >= 75) return "MIDFIELD";
  if (performance >= 68) return "REBUILDING";
  return "DEVELOPING";
}

function defaultPhilosophy(expectedPosition: number, teamCount: number): TeamPhilosophy {
  if (expectedPosition <= Math.max(2, Math.ceil(teamCount * 0.25))) return "championship";
  if (expectedPosition > Math.max(3, Math.floor(teamCount * 0.7))) return "development";
  return "balanced";
}

export function normalizeTeamDefaults(team: Team, baseSeed: number, expectedPosition: number, teamCount: number): NormalizedTeam {
  const next = structuredClone(team);
  const rng = new DeterministicRng(hashSeed(baseSeed, "team-defaults-v1", team.id));
  const performance = average(teamPerformanceValues(next));
  const budget = Math.max(0, Math.round(next.budgetCredits ?? 75_000 + performance * 700 + rng.int(-5_000, 5_000)));
  return {
    ...next,
    reputation: clampRating(next.reputation ?? performance + rng.between(-3, 3)),
    budgetCredits: budget,
    driverBudgetCredits: Math.max(0, Math.min(budget, Math.round(next.driverBudgetCredits ?? 14_000 + performance * 190))),
    developmentQuality: clampRating(next.developmentQuality ?? next.ratings.developmentPotential),
    academyQuality: clampRating(next.academyQuality ?? 58 + rng.int(-10, 18)),
    facilities: clampRating(next.facilities ?? performance + rng.between(-5, 5)),
    scoutingQuality: clampRating(next.scoutingQuality ?? 62 + rng.int(-10, 20)),
    philosophy: next.philosophy ?? defaultPhilosophy(expectedPosition, teamCount),
    strategyState: next.strategyState ?? defaultTeamState(performance),
    riskTolerance: clampRating(next.riskTolerance ?? rng.int(30, 80)),
    prestige: clampRating(next.prestige ?? performance + rng.between(-4, 4)),
    championshipExpectations: Math.max(1, Math.min(teamCount, Math.round(next.championshipExpectations ?? expectedPosition))),
    careerStats: emptyTeamCareerStats(next.careerStats),
  };
}

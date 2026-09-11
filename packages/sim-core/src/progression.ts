import { DeterministicRng, hashSeed } from "./rng";
import type { Driver, DriverRatings, TeamPerformanceField, TeamUpgrade, Universe } from "./types";

const driverFields: Array<keyof DriverRatings> = [
  "qualifyingPace",
  "racePace",
  "tireManagement",
  "overtaking",
  "defending",
  "braking",
  "cornering",
  "wetWeather",
  "consistency",
  "experience",
];

const teamFields: TeamPerformanceField[] = [
  "power",
  "aerodynamics",
  "mechanicalGrip",
  "tirePreservation",
  "reliability",
  "pitCrew",
  "strategy",
];

const rookieNames: Array<[string, string, string]> = [
  ["Theo", "Martel", "FRA"],
  ["Maya", "Kovacs", "HUN"],
  ["Elias", "Nordin", "SWE"],
  ["Sofia", "Ibarra", "MEX"],
  ["Noah", "Okafor", "NGA"],
  ["Luca", "Bellini", "ITA"],
  ["Ari", "Santos", "BRA"],
  ["Keira", "Tanaka", "JPN"],
  ["Jonas", "Lind", "DNK"],
  ["Imani", "Price", "GBR"],
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratingAverage(driver: Driver): number {
  return driverFields.reduce((sum, field) => sum + driver.ratings[field], 0) / driverFields.length;
}

/**
 * Apply one deterministic development beat between two race weekends. A team
 * can gain a small upgrade, suffer a setback, or miss the window entirely.
 * The stored TeamUpgrade is the audit-friendly source for the story layer.
 */
export function applyInSeasonDevelopment(input: Universe): Universe {
  const universe = structuredClone(input);
  if (universe.season.phase !== "between-weekends") return universe;
  const nextRound = universe.season.currentRoundIndex + 1;
  if (nextRound > universe.season.weekends.length) return universe;
  const upgrades = universe.season.teamUpgrades ?? [];
  const rng = new DeterministicRng(hashSeed(universe.baseSeed, universe.season.year, "in-season-upgrades", nextRound));

  universe.season.teams.forEach((team, index) => {
    const potential = team.ratings.developmentPotential;
    const chance = Math.min(0.8, 0.27 + (potential / 100) * 0.32) * universe.randomness.developmentVariance;
    if (!rng.chance(chance)) return;
    const field = teamFields[(rng.int(0, teamFields.length - 1) + index) % teamFields.length]!;
    const setback = rng.chance(0.16 + (100 - potential) / 900);
    const magnitude = setback ? -rng.int(1, 2) : rng.int(1, Math.max(2, Math.round(1 + potential / 55)));
    const delta = Math.max(-3, Math.min(4, magnitude));
    team.ratings[field] = clamp(team.ratings[field] + delta);
    const direction = delta > 0 ? "gained" : "lost";
    const summary = `${team.name} ${direction} ${Math.abs(delta)} ${field.replace(/([a-z])([A-Z])/g, "$1 $2")} point${Math.abs(delta) === 1 ? "" : "s"} ${delta > 0 ? "after a successful development package" : "in a development setback"}.`;
    upgrades.push({
      id: `upgrade-${universe.baseSeed}-${universe.season.year}-${nextRound}-${team.id}-${field}`,
      teamId: team.id,
      season: universe.season.year,
      round: nextRound,
      field,
      delta,
      summary,
    });
    universe.audit.push({
      id: `audit-upgrade-${universe.baseSeed}-${universe.season.year}-${nextRound}-${team.id}-${field}-${universe.audit.length}`,
      action: "team-upgrade",
      summary,
      at: new Date().toISOString(),
    });
  });
  universe.season.teamUpgrades = upgrades;
  return universe;
}

/** Progress a driver into the next season using age, potential, and form. */
export function progressDriverForNextSeason(driver: Driver, rng: DeterministicRng, developmentVariance = 1): Driver {
  const next = structuredClone(driver);
  const previousRatings = structuredClone(next.ratings);
  next.age += 1;
  const average = ratingAverage(next);
  const potentialGap = next.potential - average;
  let ageEffect: number;
  if (next.age <= 22) ageEffect = 0.8;
  else if (next.age <= 27) ageEffect = 0.45;
  else if (next.age <= 32) ageEffect = 0.12;
  else if (next.age <= 36) ageEffect = -0.35;
  else if (next.age <= 40) ageEffect = -0.7;
  else ageEffect = -1.35 - (next.age - 40) * 0.08;

  driverFields.forEach((field, index) => {
    const potentialWeight = field === "experience" ? 0.02 : 0.055;
    const correlated = potentialGap * potentialWeight + ageEffect;
    const noise = rng.between(-1.05, 1.05) * developmentVariance;
    const specialization = index % 3 === 0 ? (next.form - 50) * 0.008 : 0;
    next.ratings[field] = clamp(next.ratings[field] + correlated + noise + specialization);
  });
  if (next.age < 36) next.ratings.experience = clamp(next.ratings.experience + 1 + (next.age < 28 ? 1 : 0));
  else if (next.age > 42) next.ratings.experience = clamp(next.ratings.experience - 1);
  if (driverFields.every((field) => next.ratings[field] === previousRatings[field])) {
    next.ratings.racePace = clamp(next.ratings.racePace + (ageEffect >= 0 ? 1 : -1));
  }
  next.form = 50;
  next.pressure = 50;
  next.morale = clamp(next.morale + Math.round(rng.between(-4, 4)));
  next.injury = undefined;
  return next;
}

/** Generate a deterministic, editable free-agent pool for an offseason. */
export function generateRookies(input: Universe, targetSeason: number, rng = new DeterministicRng(hashSeed(input.baseSeed, targetSeason, "rookie-pool"))): Driver[] {
  const existingIds = new Set(input.season.drivers.map((driver) => driver.id));
  const existingNumbers = new Set(input.season.drivers.map((driver) => driver.number));
  const count = rng.int(2, 4);
  const rookies: Driver[] = [];
  for (let index = 0; index < count; index += 1) {
    const [givenName, familyName, nationality] = rookieNames[(rng.int(0, rookieNames.length - 1) + index) % rookieNames.length]!;
    const id = `rookie-${targetSeason}-${input.id}-${index + 1}`;
    if (existingIds.has(id)) continue;
    let number = 90 + index;
    while (existingNumbers.has(number)) number += 1;
    existingNumbers.add(number);
    const potential = clamp(rng.between(76, 94));
    const base = clamp(rng.between(58, 76));
    const wetWeather = clamp(base + rng.int(-2, 10));
    rookies.push({
      id,
      givenName,
      familyName,
      code: `R${targetSeason.toString().slice(-2)}${index + 1}`,
      number,
      nationality,
      age: rng.int(18, 22),
      ratings: {
        qualifyingPace: clamp(base + rng.int(0, 8)),
        racePace: clamp(base + rng.int(-2, 7)),
        tireManagement: clamp(base + rng.int(-2, 8)),
        overtaking: clamp(base + rng.int(2, 10)),
        defending: clamp(base + rng.int(-1, 8)),
        braking: clamp(base + rng.int(0, 8)),
        cornering: clamp(base + rng.int(0, 9)),
        wetWeather,
        consistency: clamp(base + rng.int(-4, 6)),
        experience: clamp(base - 8 + rng.int(-3, 6)),
      },
      potential,
      form: 50,
      morale: 58,
      pressure: 35,
      evidence: {
        source: "Generated rookie pool",
        method: "Deterministic academy profile with potential-weighted baseline",
        confidence: "medium",
        updatedAt: new Date().toISOString(),
      },
    });
  }
  return rookies;
}

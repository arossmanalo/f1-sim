import { clampRating, deriveCareerPhase, emptyDriverCareerStats } from "./defaults";
import {
  generateIdentity,
  GLOBAL_NATIONALITY_PROFILES,
  selectNationalityProfile,
  type NationalityProfile,
} from "./nationalities";
import { DeterministicRng, hashSeed } from "./rng";
import type {
  DriverAdvancedRatings,
  DriverArchetype,
  DriverPersonality,
  DriverRatings,
  DriverStatus,
  Id,
  JuniorState,
  NormalizedDriver,
  NormalizedTeam,
  WorldConfig,
} from "./types";

type RatingField = keyof DriverRatings;
type AdvancedRatingField = keyof DriverAdvancedRatings;

const RATING_FIELDS: readonly RatingField[] = [
  "qualifyingPace", "racePace", "tireManagement", "overtaking", "defending",
  "braking", "cornering", "wetWeather", "consistency", "experience",
];

const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

const ARCHETYPE_WEIGHTS: ReadonlyArray<readonly [DriverArchetype, number]> = [
  ["all-rounder", 18], ["qualifying-specialist", 8], ["racecraft-specialist", 10],
  ["tire-whisperer", 7], ["wet-weather-specialist", 5], ["aggressive-racer", 8],
  ["consistent-driver", 8], ["technical-driver", 7], ["late-bloomer", 7],
  ["pay-driver", 5], ["development-project", 10],
];

const ARCHETYPE_RATING_MODIFIERS: Readonly<Record<DriverArchetype, Partial<Record<RatingField | AdvancedRatingField, number>>>> = {
  "all-rounder": {},
  "qualifying-specialist": { qualifyingPace: 7, braking: 3, consistency: -2 },
  "racecraft-specialist": { racePace: 5, overtaking: 5, defending: 3, qualifyingPace: -2 },
  "tire-whisperer": { tireManagement: 8, consistency: 4, racePace: 3, qualifyingPace: -2 },
  "wet-weather-specialist": { wetWeather: 9, adaptability: 5, consistency: 2 },
  "aggressive-racer": { overtaking: 7, braking: 3, consistency: -4, defending: -1 },
  "consistent-driver": { consistency: 8, pressureHandling: 5, racePace: 2 },
  "technical-driver": { technicalFeedback: 9, tireManagement: 4, experience: 2 },
  "late-bloomer": { technicalFeedback: 3, consistency: 2 },
  prodigy: { qualifyingPace: 5, racePace: 5, cornering: 4, adaptability: 4 },
  "pay-driver": {},
  "development-project": { experience: -5, consistency: -3 },
  "veteran-leader": { experience: 8, technicalFeedback: 7, consistency: 4 },
};

const ARCHETYPE_PERSONALITY_MODIFIERS: Readonly<Record<DriverArchetype, Partial<DriverPersonality>>> = {
  "all-rounder": {},
  "qualifying-specialist": { confidence: 6 },
  "racecraft-specialist": { aggression: 5, confidence: 4 },
  "tire-whisperer": { patience: 8, workEthic: 4 },
  "wet-weather-specialist": { riskTolerance: 5, confidence: 4 },
  "aggressive-racer": { aggression: 14, riskTolerance: 11, patience: -8 },
  "consistent-driver": { patience: 7, teamwork: 5, workEthic: 5 },
  "technical-driver": { teamwork: 6, workEthic: 8, patience: 5 },
  "late-bloomer": { patience: 10, workEthic: 6, ambition: 3 },
  prodigy: { ambition: 13, confidence: 8, patience: -4 },
  "pay-driver": { moneyMotivation: 12, marketability: 12 },
  "development-project": { ambition: 5, workEthic: 3 },
  "veteran-leader": { loyalty: 8, teamwork: 10, patience: 8 },
};

export interface ProspectGenerationInput {
  seed: number;
  season: number;
  index: number;
  config: WorldConfig;
  status?: Extract<DriverStatus, "f3" | "f2" | "reserve" | "free-agent">;
  existingDriverIds?: Iterable<Id>;
  existingNumbers?: Iterable<number>;
  nationalityProfiles?: readonly NationalityProfile[];
}

export interface CareerDevelopmentContext {
  seed: number;
  season: number;
  config: WorldConfig;
  team?: NormalizedTeam;
  opportunity?: number;
}

export interface CareerDevelopmentResult {
  driver: NormalizedDriver;
  beforeOverall: number;
  afterOverall: number;
  overallDelta: number;
  attributeDeltas: Record<RatingField | AdvancedRatingField, number>;
}

export interface RetirementContext {
  seed: number;
  season: number;
  config: WorldConfig;
  recentOverallDelta?: number;
  yearsWithoutF1Seat?: number;
  competitiveOfferScore?: number;
  injuryModifier?: number;
}

export interface RetirementDecision {
  retire: boolean;
  probability: number;
  roll: number;
  continuationUtility: number;
  components: Record<string, number>;
  reasons: string[];
}

export interface JuniorStanding {
  category: "f3" | "f2";
  driverId: Id;
  rank: number;
  points: number;
  wins: number;
  podiums: number;
  performanceScore: number;
}

export interface CareerPopulationLimits {
  f3: number;
  f2: number;
  reserve: number;
  freeAgent: number;
  otherMotorsport: number;
  retired: number;
}

export const DEFAULT_CAREER_POPULATION_LIMITS: CareerPopulationLimits = {
  f3: 30,
  f2: 24,
  reserve: 24,
  freeAgent: 48,
  otherMotorsport: 80,
  retired: 240,
};

export interface JuniorEcosystemInput {
  seed: number;
  season: number;
  config: WorldConfig;
  drivers: readonly NormalizedDriver[];
  teams: readonly NormalizedTeam[];
  juniorState: JuniorState;
  populationLimits?: Partial<CareerPopulationLimits>;
}

export interface JuniorEcosystemResult {
  drivers: NormalizedDriver[];
  juniorState: JuniorState;
  f3Standings: JuniorStanding[];
  f2Standings: JuniorStanding[];
  promotedToF2DriverIds: Id[];
  graduatedDriverIds: Id[];
  academySignedDriverIds: Id[];
  academyReleasedDriverIds: Id[];
  incomingDriverIds: Id[];
  removedDriverIds: Id[];
  events: string[];
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function chooseWeighted<T>(rng: DeterministicRng, entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (total <= 0) return entries[0]![0];
  let roll = rng.between(0, total);
  for (const [value, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return value;
  }
  return entries.at(-1)![0];
}

function makeCode(givenName: string, familyName: string, index: number): string {
  const cleanFamily = familyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
  const cleanGiven = givenName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
  const raw = cleanFamily.length >= 3 ? cleanFamily.slice(0, 3) : `${cleanFamily}${cleanGiven}`.slice(0, 3);
  return (raw || `R${index % 100}`).padEnd(3, String(index % 10)).slice(0, 3);
}

function uniqueId(base: string, existing: Set<Id>): Id {
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function uniqueNumber(rng: DeterministicRng, existing: Set<number>): number {
  const offset = rng.int(0, 97);
  for (let step = 0; step < 98; step += 1) {
    const candidate = 2 + ((offset + step) % 98);
    if (!existing.has(candidate)) return candidate;
  }
  let candidate = 100;
  while (existing.has(candidate)) candidate += 1;
  return candidate;
}

function personalityForArchetype(rng: DeterministicRng, archetype: DriverArchetype): DriverPersonality {
  const modifiers = ARCHETYPE_PERSONALITY_MODIFIERS[archetype];
  const value = (field: keyof DriverPersonality, base: number) => clampRating(base + (modifiers[field] ?? 0));
  return {
    ambition: value("ambition", rng.int(42, 82)),
    loyalty: value("loyalty", rng.int(28, 82)),
    aggression: value("aggression", rng.int(32, 76)),
    patience: value("patience", rng.int(32, 78)),
    riskTolerance: value("riskTolerance", rng.int(30, 80)),
    moneyMotivation: value("moneyMotivation", rng.int(25, 78)),
    teamwork: value("teamwork", rng.int(40, 86)),
    confidence: value("confidence", rng.int(40, 75)),
    workEthic: value("workEthic", rng.int(45, 90)),
    marketability: value("marketability", rng.int(30, 82)),
  };
}

function potentialForProspect(rng: DeterministicRng, generational: boolean): number {
  if (generational) return rng.int(96, 99);
  const band = chooseWeighted(rng, [
    [[60, 69] as const, 10],
    [[70, 79] as const, 40],
    [[80, 89] as const, 35],
    [[90, 94] as const, 12],
    [[95, 99] as const, 3],
  ]);
  return rng.int(band[0], band[1]);
}

function ratingForProspect(
  rng: DeterministicRng,
  base: number,
  archetype: DriverArchetype,
  field: RatingField,
): number {
  const modifiers = ARCHETYPE_RATING_MODIFIERS[archetype];
  const sharedSkill = rng.between(-2.4, 2.4);
  const experiencePenalty = field === "experience" ? -7 : 0;
  return clampRating(base + sharedSkill + rng.between(-3.5, 3.5) + (modifiers[field] ?? 0) + experiencePenalty);
}

/**
 * Generate one prospect from independent identity, talent, and personality
 * substreams. Changing nationality weights cannot consume talent RNG values.
 */
export function generateProspect(input: ProspectGenerationInput): NormalizedDriver {
  const rootSeed = hashSeed(input.seed, input.season, input.index, "prospect-v1");
  const identityRng = new DeterministicRng(hashSeed(rootSeed, "identity"));
  const talentRng = new DeterministicRng(hashSeed(rootSeed, "talent"));
  const personalityRng = new DeterministicRng(hashSeed(rootSeed, "personality"));
  const profile = selectNationalityProfile(
    identityRng,
    input.config.generation.nationalityWeights,
    input.nationalityProfiles ?? GLOBAL_NATIONALITY_PROFILES,
  );
  const identity = generateIdentity(identityRng, profile);
  const generational = talentRng.chance(input.config.generation.generationalTalentChance);
  const archetype = generational ? "prodigy" : chooseWeighted(talentRng, ARCHETYPE_WEIGHTS);
  const age = talentRng.int(15, 18);
  const potential = potentialForProspect(talentRng, generational);
  const centeredNoise = (talentRng.next() + talentRng.next() + talentRng.next() - 1.5) * 6;
  const ageBase = 47 + (age - 15) * 2.5;
  const baseAbility = Math.max(42, Math.min(76, ageBase + (potential - 76) * 0.16 + centeredNoise + (generational ? 6 : 0)));
  const ratings = Object.fromEntries(RATING_FIELDS.map((field) => [field, ratingForProspect(talentRng, baseAbility, archetype, field)])) as unknown as DriverRatings;
  const modifiers = ARCHETYPE_RATING_MODIFIERS[archetype];
  const advancedRatings: DriverAdvancedRatings = {
    adaptability: clampRating(baseAbility + talentRng.between(-4, 4) + (modifiers.adaptability ?? 0)),
    technicalFeedback: clampRating(baseAbility + talentRng.between(-4, 4) + (modifiers.technicalFeedback ?? 0)),
    pressureHandling: clampRating(baseAbility + talentRng.between(-4, 4) + (modifiers.pressureHandling ?? 0)),
  };
  const personality = personalityForArchetype(personalityRng, archetype);
  const existingIds = new Set(input.existingDriverIds ?? []);
  const existingNumbers = new Set(input.existingNumbers ?? []);
  const id = uniqueId(`generated-${input.season}-${rootSeed.toString(36)}`, existingIds);
  const backing = archetype === "pay-driver" ? personalityRng.int(6_000, 28_000) : personalityRng.chance(0.12) ? personalityRng.int(1_000, 8_000) : 0;

  return {
    id,
    givenName: identity.givenName,
    familyName: identity.familyName,
    code: makeCode(identity.givenName, identity.familyName, input.index),
    number: uniqueNumber(identityRng, existingNumbers),
    nationality: identity.nationality,
    countryCode: identity.countryCode,
    age,
    ratings,
    potential,
    potentialMin: Math.max(50, potential - talentRng.int(3, 8)),
    potentialMax: Math.min(99, potential + talentRng.int(0, 2)),
    developmentRate: Math.max(input.config.development.minimumRate, Math.min(input.config.development.maximumRate, talentRng.between(0.7, 1.35))),
    generatedDriver: true,
    status: input.status ?? "f3",
    careerPhase: deriveCareerPhase(age),
    archetype,
    advancedRatings,
    personality,
    careerStats: emptyDriverCareerStats(),
    reputation: clampRating(baseAbility - 8),
    financialBackingCredits: backing,
    sponsorshipValue: Math.round(backing * 0.4 + personality.marketability * 35),
    form: 50,
    morale: 55,
    pressure: 35,
    evidence: {
      source: "Procedural junior ecosystem",
      method: "Seeded archetype-correlated prospect model with independent identity and talent streams",
      confidence: "low",
      updatedAt: `${String(input.season).padStart(4, "0")}-01-01T00:00:00.000Z`,
    },
  };
}

export function generateProspectClass(
  input: Omit<ProspectGenerationInput, "index"> & { count: number },
): NormalizedDriver[] {
  const ids = new Set(input.existingDriverIds ?? []);
  const numbers = new Set(input.existingNumbers ?? []);
  const prospects: NormalizedDriver[] = [];
  for (let index = 0; index < Math.max(0, Math.floor(input.count)); index += 1) {
    const prospect = generateProspect({ ...input, index, existingDriverIds: ids, existingNumbers: numbers });
    ids.add(prospect.id);
    numbers.add(prospect.number);
    prospects.push(prospect);
  }
  return prospects;
}

export function calculateCareerOverall(driver: NormalizedDriver, config: WorldConfig): number {
  const weights = config.driverOverallWeights;
  const values: Array<[number, number]> = [
    [driver.ratings.racePace, weights.racePace],
    [driver.ratings.qualifyingPace, weights.qualifyingPace],
    [driver.ratings.consistency, weights.consistency],
    [driver.ratings.wetWeather, weights.wetWeather],
    [driver.ratings.tireManagement, weights.tireManagement],
    [driver.ratings.experience, weights.experience],
    [driver.ratings.defending, weights.defending],
    [driver.ratings.overtaking, weights.overtaking],
    [driver.advancedRatings.adaptability, weights.adaptability],
    [driver.advancedRatings.technicalFeedback, weights.technicalFeedback],
    [driver.advancedRatings.pressureHandling, weights.pressureHandling],
  ];
  const totalWeight = values.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  return totalWeight <= 0 ? average(Object.values(driver.ratings)) : values.reduce((sum, [value, weight]) => sum + value * Math.max(0, weight), 0) / totalWeight;
}

function flexibleCareerPhase(driver: NormalizedDriver, nextAge: number): NormalizedDriver["careerPhase"] {
  if (driver.archetype === "late-bloomer" && nextAge >= 24 && nextAge <= 29) return "rapid-development";
  if (driver.archetype === "veteran-leader" && nextAge <= 37) return "late-prime";
  return deriveCareerPhase(nextAge);
}

function opportunityForStatus(status: DriverStatus): number {
  if (status === "f1") return 1;
  if (status === "f2") return 0.96;
  if (status === "f3") return 0.9;
  if (status === "reserve") return 0.67;
  if (status === "free-agent") return 0.43;
  return 0.25;
}

function ageCurve(driver: NormalizedDriver, age: number): number {
  let curve: number;
  if (age <= 19) curve = 1.4;
  else if (age <= 23) curve = 1.15;
  else if (age <= 27) curve = 0.62;
  else if (age <= 32) curve = 0.12;
  else if (age <= 35) curve = -0.22;
  else if (age <= 38) curve = -0.72;
  else curve = -1.2 - (age - 39) * 0.18;
  if (driver.archetype === "late-bloomer") {
    if (age <= 23) curve *= 0.58;
    else if (age <= 29) curve += 0.72;
  }
  if (driver.archetype === "veteran-leader" && age >= 34) curve += 0.22;
  return curve;
}

function specializationMultiplier(archetype: DriverArchetype, field: RatingField | AdvancedRatingField): number {
  const modifier = ARCHETYPE_RATING_MODIFIERS[archetype][field] ?? 0;
  return modifier > 0 ? 1.12 : modifier < 0 ? 0.94 : 1;
}

/** Advance one driver by one year while keeping annual rating movement capped. */
export function developDriverCareer(driver: NormalizedDriver, context: CareerDevelopmentContext): CareerDevelopmentResult {
  const next = structuredClone(driver);
  const before = structuredClone(driver);
  const beforeOverall = calculateCareerOverall(before, context.config);
  if (next.status === "retired") {
    const zeroDeltas = Object.fromEntries(
      [...RATING_FIELDS, "adaptability", "technicalFeedback", "pressureHandling"].map((field) => [field, 0]),
    ) as Record<RatingField | AdvancedRatingField, number>;
    return { driver: next, beforeOverall, afterOverall: beforeOverall, overallDelta: 0, attributeDeltas: zeroDeltas };
  }

  const rng = new DeterministicRng(hashSeed(context.seed, context.season, driver.id, "career-development-v1"));
  next.age += 1;
  next.careerPhase = flexibleCareerPhase(driver, next.age);
  const potentialGap = Math.max(-6, next.potential - beforeOverall);
  const workEthic = 0.72 + next.personality.workEthic / 180;
  const consistency = 0.86 + next.ratings.consistency / 650;
  const teamQuality = context.team
    ? 0.8 + average([context.team.developmentQuality, context.team.facilities]) / 250
    : 0.94;
  const opportunity = Math.max(0.2, Math.min(1.25, context.opportunity ?? opportunityForStatus(next.status)));
  const trajectoryNoise = rng.between(-context.config.development.yearlyVariance, context.config.development.yearlyVariance);
  let centralChange = ageCurve(next, next.age);
  if (centralChange >= 0) {
    centralChange += Math.max(0, potentialGap) * 0.045;
    centralChange *= next.developmentRate * workEthic * consistency * teamQuality * opportunity;
  } else {
    const resistance = 0.7 + (next.personality.workEthic + next.ratings.consistency) / 500;
    centralChange *= 1 / resistance;
  }
  centralChange += trajectoryNoise;
  const maxChange = Math.max(0.5, context.config.development.maximumYearlyOverallChange);
  centralChange = Math.max(-maxChange, Math.min(maxChange, centralChange));

  for (const field of RATING_FIELDS) {
    let change = centralChange * specializationMultiplier(next.archetype, field) + rng.between(-0.55, 0.55);
    if (field === "experience") {
      change = next.age <= 35 ? 1 + rng.between(0, 0.8) : next.age <= 40 ? rng.between(0, 0.7) : rng.between(-0.5, 0.3);
    } else if (next.age >= 36 && ["qualifyingPace", "braking", "cornering"].includes(field)) {
      change -= 0.25 + (next.age - 36) * 0.05;
    }
    next.ratings[field] = clampRating(next.ratings[field] + Math.max(-maxChange, Math.min(maxChange, change)));
  }

  const advancedFields: readonly AdvancedRatingField[] = ["adaptability", "technicalFeedback", "pressureHandling"];
  for (const field of advancedFields) {
    let change = centralChange * specializationMultiplier(next.archetype, field) + rng.between(-0.45, 0.45);
    if (field === "technicalFeedback" && next.age <= 38) change = Math.max(change, rng.between(0.2, 1.1));
    if (field === "pressureHandling" && next.age <= 33) change += 0.2;
    next.advancedRatings[field] = clampRating(next.advancedRatings[field] + Math.max(-maxChange, Math.min(maxChange, change)));
  }

  // Integer attributes can otherwise overshoot the configured overall cap by
  // rounding in the same direction. Scale the whole change vector if needed.
  let afterOverall = calculateCareerOverall(next, context.config);
  const actualChange = afterOverall - beforeOverall;
  if (Math.abs(actualChange) > maxChange) {
    const scale = maxChange / Math.abs(actualChange);
    for (const field of RATING_FIELDS) next.ratings[field] = clampRating(before.ratings[field] + (next.ratings[field] - before.ratings[field]) * scale);
    for (const field of advancedFields) next.advancedRatings[field] = clampRating(before.advancedRatings[field] + (next.advancedRatings[field] - before.advancedRatings[field]) * scale);
    afterOverall = calculateCareerOverall(next, context.config);
  }

  if (next.status === "f1") next.careerStats.seasons += 1;
  next.form = clampRating(50 + rng.between(-5, 5));
  next.morale = clampRating(next.morale + rng.between(-4, 4));
  next.pressure = clampRating(50 + rng.between(-7, 7));
  next.personality.confidence = clampRating(next.personality.confidence + (afterOverall - beforeOverall) * 1.5 + rng.between(-2, 2));
  next.reputation = clampRating(next.reputation * 0.82 + afterOverall * 0.18);
  next.injury = undefined;
  const attributeDeltas = Object.fromEntries([
    ...RATING_FIELDS.map((field) => [field, next.ratings[field] - before.ratings[field]] as const),
    ...advancedFields.map((field) => [field, next.advancedRatings[field] - before.advancedRatings[field]] as const),
  ]) as Record<RatingField | AdvancedRatingField, number>;
  return { driver: next, beforeOverall, afterOverall, overallDelta: afterOverall - beforeOverall, attributeDeltas };
}

/** Probability-based retirement decision. Offers help veterans continue; age alone never creates a fixed cutoff. */
export function evaluateRetirement(driver: NormalizedDriver, context: RetirementContext): RetirementDecision {
  if (driver.status === "retired") {
    return { retire: true, probability: 1, roll: 0, continuationUtility: 0, components: { alreadyRetired: 1 }, reasons: ["Driver is already retired."] };
  }
  const roll = new DeterministicRng(hashSeed(context.seed, context.season, driver.id, "retirement-v1")).next();
  const minimumAge = context.config.retirement.minimumAge;
  if (driver.age < minimumAge) {
    return { retire: false, probability: 0, roll, continuationUtility: 100, components: { protectedYouth: -1 }, reasons: ["Driver remains below the normal retirement window."] };
  }

  const ageSpan = Math.max(1, context.config.retirement.steepDeclineAge - minimumAge);
  const ageProgress = Math.max(0, driver.age - minimumAge) / ageSpan;
  const age = driver.age < context.config.retirement.baseAge
    ? 0.015 + ageProgress * 0.06
    : 0.08 + ageProgress * 0.2 + Math.max(0, driver.age - context.config.retirement.steepDeclineAge) * 0.075;
  const noSeat = driver.status === "f1" ? 0 : context.config.retirement.noSeatModifier * Math.min(2, Math.max(0, context.yearsWithoutF1Seat ?? 1));
  const decline = Math.max(0, -(context.recentOverallDelta ?? 0)) * 0.035;
  const currentAbility = average(Object.values(driver.ratings));
  const ability = currentAbility < 74 ? (74 - currentAbility) * 0.008 : currentAbility >= 88 ? -(currentAbility - 87) * 0.009 : 0;
  const offer = -Math.max(0, Math.min(100, context.competitiveOfferScore ?? 0)) * 0.0035;
  const ambition = -(driver.personality.ambition - 50) * 0.0015;
  const morale = driver.morale < 45 ? (45 - driver.morale) * 0.002 : 0;
  const fulfilled = Math.min(0.08, driver.careerStats.championships * 0.015);
  const injury = Math.max(0, context.injuryModifier ?? (driver.injury?.status === "season-ending" ? 0.1 : 0));
  const components = { age, noSeat, decline, ability, offer, ambition, morale, fulfilled, injury };
  const probability = Math.max(0.002, Math.min(0.97, Object.values(components).reduce((sum, value) => sum + value, 0)));
  const reasons = [
    driver.age >= context.config.retirement.steepDeclineAge ? "Age and physical decline weigh heavily." : "Driver has entered the retirement window.",
  ];
  if (noSeat > 0) reasons.push("Lack of an F1 seat reduces the value of continuing.");
  if (offer < -0.05) reasons.push("A competitive offer provides a strong reason to continue.");
  if (decline > 0.04) reasons.push("Recent performance decline increases retirement interest.");
  return { retire: roll < probability, probability, roll, continuationUtility: (1 - probability) * 100, components, reasons };
}

function academyTeamForDriver(state: JuniorState, driverId: Id): Id | undefined {
  return Object.entries(state.academyDriverIdsByTeam).find(([, ids]) => ids.includes(driverId))?.[0];
}

function simulateCategory(
  category: "f3" | "f2",
  driverIds: readonly Id[],
  driversById: ReadonlyMap<Id, NormalizedDriver>,
  seed: number,
  season: number,
): JuniorStanding[] {
  const entrants = driverIds.map((id) => driversById.get(id)).filter((driver): driver is NormalizedDriver => Boolean(driver) && driver!.status === category);
  const totals = new Map<Id, { points: number; wins: number; podiums: number; score: number }>();
  entrants.forEach((driver) => totals.set(driver.id, { points: 0, wins: 0, podiums: 0, score: 0 }));
  const rounds = category === "f2" ? 12 : 10;
  for (let round = 1; round <= rounds; round += 1) {
    const classified = entrants.map((driver) => {
      const rng = new DeterministicRng(hashSeed(seed, season, category, round, driver.id));
      const performance = driver.ratings.racePace * 0.28 + driver.ratings.qualifyingPace * 0.18
        + driver.ratings.consistency * 0.2 + driver.ratings.overtaking * 0.09
        + driver.ratings.tireManagement * 0.08 + driver.advancedRatings.adaptability * 0.08
        + driver.form * 0.09 + rng.between(-8, 8) * (1.2 - driver.ratings.consistency / 250);
      return { driver, performance };
    }).sort((a, b) => b.performance - a.performance || a.driver.id.localeCompare(b.driver.id));
    classified.forEach((entry, index) => {
      const total = totals.get(entry.driver.id)!;
      total.points += POINTS[index] ?? 0;
      total.wins += index === 0 ? 1 : 0;
      total.podiums += index < 3 ? 1 : 0;
      total.score += entry.performance;
    });
  }
  return [...totals.entries()]
    .sort((a, b) => b[1].points - a[1].points || b[1].wins - a[1].wins || b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .map(([driverId, result], index) => ({ category, driverId, rank: index + 1, points: result.points, wins: result.wins, podiums: result.podiums, performanceScore: result.score / rounds }));
}

function capValue(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value! : fallback));
}

function normalizeLimits(input?: Partial<CareerPopulationLimits>): CareerPopulationLimits {
  return {
    f3: capValue(input?.f3, DEFAULT_CAREER_POPULATION_LIMITS.f3),
    f2: capValue(input?.f2, DEFAULT_CAREER_POPULATION_LIMITS.f2),
    reserve: capValue(input?.reserve, DEFAULT_CAREER_POPULATION_LIMITS.reserve),
    freeAgent: capValue(input?.freeAgent, DEFAULT_CAREER_POPULATION_LIMITS.freeAgent),
    otherMotorsport: capValue(input?.otherMotorsport, DEFAULT_CAREER_POPULATION_LIMITS.otherMotorsport),
    retired: capValue(input?.retired, DEFAULT_CAREER_POPULATION_LIMITS.retired),
  };
}

function populationPriority(driver: NormalizedDriver): number {
  return calculateSimpleOverall(driver) * 0.6 + driver.potential * 0.25 + driver.reputation * 0.15 - Math.max(0, driver.age - 25) * 0.5;
}

function calculateSimpleOverall(driver: NormalizedDriver): number {
  return average([...Object.values(driver.ratings), ...Object.values(driver.advancedRatings)]);
}

export function enforceCareerPopulationCaps(
  sourceDrivers: readonly NormalizedDriver[],
  sourceState: JuniorState,
  inputLimits?: Partial<CareerPopulationLimits>,
): { drivers: NormalizedDriver[]; juniorState: JuniorState; removedDriverIds: Id[] } {
  const limits = normalizeLimits(inputLimits);
  let drivers: NormalizedDriver[] = sourceDrivers.map((driver) => structuredClone(driver));
  const demote = (status: DriverStatus, maximum: number, replacement: DriverStatus) => {
    const matching = drivers.filter((driver) => driver.status === status)
      .sort((a, b) => populationPriority(b) - populationPriority(a) || a.id.localeCompare(b.id));
    for (const driver of matching.slice(maximum)) driver.status = replacement;
  };
  demote("f3", limits.f3, "other-motorsport");
  demote("f2", limits.f2, "other-motorsport");
  demote("reserve", limits.reserve, "free-agent");
  demote("free-agent", limits.freeAgent, "other-motorsport");

  const removed = new Set<Id>();
  const prune = (status: DriverStatus, maximum: number, historical: boolean) => {
    const matching = drivers.filter((driver) => driver.status === status).sort((a, b) => {
      if (historical) {
        const legacyA = a.careerStats.championships * 10_000 + a.careerStats.wins * 100 + a.careerStats.raceStarts;
        const legacyB = b.careerStats.championships * 10_000 + b.careerStats.wins * 100 + b.careerStats.raceStarts;
        if (legacyA !== legacyB) return legacyB - legacyA;
      }
      return populationPriority(b) - populationPriority(a) || a.id.localeCompare(b.id);
    });
    matching.slice(maximum).forEach((driver) => removed.add(driver.id));
  };
  prune("other-motorsport", limits.otherMotorsport, false);
  prune("retired", limits.retired, true);
  drivers = drivers.filter((driver) => !removed.has(driver.id));
  const byId = new Map(drivers.map((driver) => [driver.id, driver]));
  const state: JuniorState = {
    season: sourceState.season,
    f3DriverIds: drivers.filter((driver) => driver.status === "f3").map((driver) => driver.id),
    f2DriverIds: drivers.filter((driver) => driver.status === "f2").map((driver) => driver.id),
    reserveDriverIds: drivers.filter((driver) => driver.status === "reserve").map((driver) => driver.id),
    academyDriverIdsByTeam: Object.fromEntries(Object.entries(sourceState.academyDriverIdsByTeam).map(([teamId, ids]) => [
      teamId,
      [...new Set(ids)].filter((id) => {
        const driver = byId.get(id);
        return driver && ["f3", "f2", "reserve"].includes(driver.status);
      }),
    ])),
    incomingClassDriverIds: sourceState.incomingClassDriverIds.filter((id) => byId.get(id)?.status === "f3"),
  };
  return { drivers, juniorState: state, removedDriverIds: [...removed].sort() };
}

function cleanAcademies(state: JuniorState, driversById: ReadonlyMap<Id, NormalizedDriver>, teams: readonly NormalizedTeam[]): JuniorState["academyDriverIdsByTeam"] {
  const claimed = new Set<Id>();
  return Object.fromEntries(teams.map((team) => [team.id, [...new Set(state.academyDriverIdsByTeam[team.id] ?? [])].filter((id) => {
    const driver = driversById.get(id);
    if (!driver || claimed.has(id) || !["f3", "f2", "reserve"].includes(driver.status)) return false;
    claimed.add(id);
    return true;
  })]));
}

function scoutEstimate(team: NormalizedTeam, driver: NormalizedDriver, seed: number, season: number): number {
  const rng = new DeterministicRng(hashSeed(seed, season, team.id, driver.id, "scouting-v1"));
  const uncertainty = Math.max(1, 13 - team.scoutingQuality * 0.11);
  return driver.potential + rng.between(-uncertainty, uncertainty);
}

/**
 * Resolve a simplified F3/F2 year, promotions, academy churn, development,
 * capped populations, and the next intake. Graduating from F2 yields market
 * eligibility, never an automatic F1 seat.
 */
export function advanceJuniorEcosystem(input: JuniorEcosystemInput): JuniorEcosystemResult {
  const limits = normalizeLimits(input.populationLimits);
  let drivers: NormalizedDriver[] = input.drivers.map((driver) => structuredClone(driver));
  let driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const state: JuniorState = {
    ...structuredClone(input.juniorState),
    academyDriverIdsByTeam: cleanAcademies(input.juniorState, driversById, input.teams),
  };
  state.f3DriverIds = [...new Set(state.f3DriverIds)].filter((id) => driversById.get(id)?.status === "f3");
  state.f2DriverIds = [...new Set(state.f2DriverIds)].filter((id) => driversById.get(id)?.status === "f2");
  state.reserveDriverIds = [...new Set(state.reserveDriverIds)].filter((id) => driversById.get(id)?.status === "reserve");
  const f3Standings = simulateCategory("f3", state.f3DriverIds, driversById, input.seed, input.season);
  const f2Standings = simulateCategory("f2", state.f2DriverIds, driversById, input.seed, input.season);
  const events: string[] = [];

  const f2GraduationSlots = Math.min(4, Math.max(1, Math.ceil(f2Standings.length / 7)));
  const graduating = f2Standings.filter((standing) => {
    const driver = driversById.get(standing.driverId)!;
    return driver.age >= input.config.generation.promotionMinimumAge
      && (standing.rank <= 3 || calculateSimpleOverall(driver) >= 72 || driver.potential >= 89);
  }).slice(0, f2GraduationSlots);
  const graduatedDriverIds = graduating.map((standing) => standing.driverId);
  for (const standing of graduating) {
    const driver = driversById.get(standing.driverId)!;
    driver.status = academyTeamForDriver(state, driver.id) ? "reserve" : "free-agent";
    driver.reputation = clampRating(driver.reputation + Math.max(3, 9 - standing.rank));
    events.push(`${driver.givenName} ${driver.familyName} graduated from F2 into the F1 market as a ${driver.status}.`);
  }

  const continuingF2 = state.f2DriverIds.filter((id) => !graduatedDriverIds.includes(id));
  const availableF2Seats = Math.max(0, limits.f2 - continuingF2.length);
  const promotionCount = Math.min(6, availableF2Seats, Math.max(0, Math.ceil(f3Standings.length / 5)));
  const promoted = f3Standings.filter((standing) => {
    const driver = driversById.get(standing.driverId)!;
    return driver.age >= input.config.generation.promotionMinimumAge
      && (standing.rank <= Math.max(3, promotionCount) || driver.potential >= 90);
  }).slice(0, promotionCount);
  const promotedToF2DriverIds = promoted.map((standing) => standing.driverId);
  for (const standing of promoted) {
    const driver = driversById.get(standing.driverId)!;
    driver.status = "f2";
    driver.reputation = clampRating(driver.reputation + Math.max(2, 7 - standing.rank));
    events.push(`${driver.givenName} ${driver.familyName} earned promotion from F3 to F2.`);
  }

  // Academy release decisions are based on current ability and imperfect
  // scouting, not nationality or scripted team identities.
  const academyReleasedDriverIds: Id[] = [];
  for (const team of input.teams) {
    const retained: Id[] = [];
    for (const driverId of state.academyDriverIdsByTeam[team.id] ?? []) {
      const driver = driversById.get(driverId);
      if (!driver) continue;
      const rng = new DeterministicRng(hashSeed(input.seed, input.season, team.id, driverId, "academy-retention-v1"));
      const weak = calculateSimpleOverall(driver) < 59 && scoutEstimate(team, driver, input.seed, input.season) < 74;
      if (weak && rng.chance(0.3 + (100 - team.academyQuality) / 250)) {
        academyReleasedDriverIds.push(driverId);
        events.push(`${team.name} released ${driver.givenName} ${driver.familyName} from its academy.`);
      } else retained.push(driverId);
    }
    state.academyDriverIdsByTeam[team.id] = retained;
  }

  // Develop only drivers who participated in this junior year. F1 and older
  // free-agent careers are advanced by the main career loop during integration.
  const participants = new Set([...state.f3DriverIds, ...state.f2DriverIds]);
  for (const driverId of participants) {
    const driver = driversById.get(driverId);
    if (!driver) continue;
    const academyId = academyTeamForDriver(state, driverId);
    const team = input.teams.find((candidate) => candidate.id === academyId);
    const result = developDriverCareer(driver, { seed: input.seed, season: input.season, config: input.config, team });
    Object.assign(driver, result.driver);
  }

  // Drivers who age out remain available where sensible instead of vanishing.
  for (const driver of drivers) {
    if (driver.status === "f3" && driver.age > 22) driver.status = "other-motorsport";
    if (driver.status === "f2" && driver.age > 25) driver.status = calculateSimpleOverall(driver) >= 70 ? "free-agent" : "other-motorsport";
  }

  const existingIds = new Set(drivers.map((driver) => driver.id));
  const existingNumbers = new Set(drivers.map((driver) => driver.number));
  const currentF3Count = drivers.filter((driver) => driver.status === "f3").length;
  const intakeCount = Math.min(Math.max(0, limits.f3 - currentF3Count), Math.max(0, Math.floor(input.config.generation.f3PerSeason)));
  const incoming = generateProspectClass({
    seed: input.seed,
    season: input.season + 1,
    count: intakeCount,
    config: input.config,
    existingDriverIds: existingIds,
    existingNumbers,
  });
  drivers.push(...incoming);
  driversById = new Map(drivers.map((driver) => [driver.id, driver]));

  // Each academy makes independent, explainable scouting choices. A claimed
  // prospect is removed from later teams' candidate lists.
  const academySignedDriverIds: Id[] = [];
  const claimed = new Set(Object.values(state.academyDriverIdsByTeam).flat());
  for (const team of [...input.teams].sort((a, b) => b.academyQuality - a.academyQuality || a.id.localeCompare(b.id))) {
    const current = state.academyDriverIdsByTeam[team.id] ?? [];
    const capacity = Math.max(0, 3 - current.length);
    if (capacity === 0) continue;
    const candidates = incoming.filter((driver) => !claimed.has(driver.id)).map((driver) => ({
      driver,
      utility: scoutEstimate(team, driver, input.seed, input.season + 1) * 0.58
        + calculateSimpleOverall(driver) * 0.27 + driver.personality.workEthic * 0.1 + driver.personality.marketability * 0.05,
    })).sort((a, b) => b.utility - a.utility || a.driver.id.localeCompare(b.driver.id));
    const signingCount = Math.min(capacity, team.academyQuality >= 70 ? 2 : team.academyQuality >= 45 ? 1 : 0);
    for (const candidate of candidates.slice(0, signingCount)) {
      current.push(candidate.driver.id);
      claimed.add(candidate.driver.id);
      academySignedDriverIds.push(candidate.driver.id);
      events.push(`${team.name} signed ${candidate.driver.givenName} ${candidate.driver.familyName} to its academy.`);
    }
    state.academyDriverIdsByTeam[team.id] = current;
  }

  state.season = input.season + 1;
  state.f3DriverIds = drivers.filter((driver) => driver.status === "f3").map((driver) => driver.id);
  state.f2DriverIds = drivers.filter((driver) => driver.status === "f2").map((driver) => driver.id);
  state.reserveDriverIds = drivers.filter((driver) => driver.status === "reserve").map((driver) => driver.id);
  state.incomingClassDriverIds = incoming.map((driver) => driver.id);
  const capped = enforceCareerPopulationCaps(drivers, state, limits);
  if (capped.removedDriverIds.length) events.push(`${capped.removedDriverIds.length} inactive career records moved out of the live population cap.`);
  return {
    drivers: capped.drivers,
    juniorState: capped.juniorState,
    f3Standings,
    f2Standings,
    promotedToF2DriverIds,
    graduatedDriverIds,
    academySignedDriverIds,
    academyReleasedDriverIds,
    incomingDriverIds: incoming.map((driver) => driver.id).filter((id) => !capped.removedDriverIds.includes(id)),
    removedDriverIds: capped.removedDriverIds,
    events,
  };
}

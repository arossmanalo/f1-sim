import type { WorldConfig } from "./types";

export const CURRENT_UNIVERSE_SCHEMA_VERSION = 2 as const;

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  version: 1,
  debugAiDecisions: false,
  driverOverallWeights: {
    racePace: 0.2,
    qualifyingPace: 0.15,
    consistency: 0.15,
    wetWeather: 0.08,
    tireManagement: 0.1,
    experience: 0.05,
    defending: 0.07,
    overtaking: 0.08,
    adaptability: 0.04,
    technicalFeedback: 0.04,
    pressureHandling: 0.04,
  },
  teamPhilosophyWeights: {
    championship: { currentPerformance: 0.35, consistency: 0.2, experience: 0.15, potential: 0.1, age: 0, academyStatus: 0, marketability: 0.05, salaryEfficiency: 0.05, teamFit: 0.1 },
    balanced: { currentPerformance: 0.2, consistency: 0.1, experience: 0.05, potential: 0.25, age: 0, academyStatus: 0, marketability: 0.05, salaryEfficiency: 0.25, teamFit: 0.1 },
    development: { currentPerformance: 0.15, consistency: 0, experience: 0, potential: 0.35, age: 0.15, academyStatus: 0.2, marketability: 0, salaryEfficiency: 0.1, teamFit: 0.05 },
    "financial-survival": { currentPerformance: 0.15, consistency: 0.08, experience: 0.02, potential: 0.12, age: 0.03, academyStatus: 0.05, marketability: 0.15, salaryEfficiency: 0.35, teamFit: 0.05 },
  },
  development: {
    minimumRate: 0.55,
    maximumRate: 1.45,
    yearlyVariance: 0.18,
    maximumYearlyOverallChange: 4,
  },
  retirement: {
    minimumAge: 31,
    baseAge: 36,
    steepDeclineAge: 40,
    noSeatModifier: 0.16,
  },
  market: {
    maximumRounds: 8,
    maximumIterations: 250,
    minimumContractYears: 1,
    maximumContractYears: 5,
    salaryFloorCredits: 1_000,
  },
  generation: {
    f3PerSeason: 8,
    promotionMinimumAge: 17,
    generationalTalentChance: 0.012,
    nationalityWeights: {
      ARG: 2, AUS: 4, AUT: 2, BEL: 2, BRA: 7, CAN: 4, CHE: 2, CHN: 4, COL: 2, CZE: 1,
      DEU: 7, DNK: 3, ESP: 7, EST: 1, FIN: 4, FRA: 8, GBR: 12, HUN: 2, IND: 5, IRL: 2,
      ITA: 10, JPN: 7, KOR: 2, MEX: 5, MCO: 1, NLD: 5, NOR: 3, NZL: 3, POL: 3, PRT: 3,
      SWE: 3, THA: 3, USA: 9, ZAF: 3,
    },
  },
};

/** Return a save-owned copy so user balancing changes never mutate defaults. */
export function createDefaultWorldConfig(): WorldConfig {
  return structuredClone(DEFAULT_WORLD_CONFIG);
}

/** Deep-fill a persisted configuration while preserving save-specific tuning. */
export function normalizeWorldConfig(input?: Partial<WorldConfig>): WorldConfig {
  const defaults = createDefaultWorldConfig();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    version: 1,
    driverOverallWeights: { ...defaults.driverOverallWeights, ...input.driverOverallWeights },
    teamPhilosophyWeights: {
      championship: { ...defaults.teamPhilosophyWeights.championship, ...input.teamPhilosophyWeights?.championship },
      balanced: { ...defaults.teamPhilosophyWeights.balanced, ...input.teamPhilosophyWeights?.balanced },
      development: { ...defaults.teamPhilosophyWeights.development, ...input.teamPhilosophyWeights?.development },
      "financial-survival": { ...defaults.teamPhilosophyWeights["financial-survival"], ...input.teamPhilosophyWeights?.["financial-survival"] },
    },
    development: { ...defaults.development, ...input.development },
    retirement: { ...defaults.retirement, ...input.retirement },
    market: { ...defaults.market, ...input.market },
    generation: {
      ...defaults.generation,
      ...input.generation,
      nationalityWeights: { ...defaults.generation.nationalityWeights, ...input.generation?.nationalityWeights },
    },
  };
}

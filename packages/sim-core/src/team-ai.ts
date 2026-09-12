import { DEFAULT_WORLD_CONFIG } from "./config";
import { DeterministicRng, hashSeed } from "./rng";
import type {
  Contract,
  DriverCareerPhase,
  NormalizedDriver,
  NormalizedTeam,
  TeamStrategyState,
  UtilityScoreBreakdown,
  WorldConfig,
} from "./types";

const SCORE_SCALE = 100;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function cents(value: number): number {
  return Math.round(value * SCORE_SCALE);
}

function fromCents(value: number): number {
  return value / SCORE_SCALE;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Build an auditable score whose rounded components and modifiers reconcile
 * exactly to the rounded total. A normalization modifier records any clamp at
 * the 0-100 boundary rather than hiding it from the explanation.
 */
function finalizeBreakdown(
  inputComponents: Record<string, number>,
  inputModifiers: Record<string, number> = {},
): UtilityScoreBreakdown {
  const components = Object.fromEntries(
    Object.entries(inputComponents).map(([key, value]) => [key, fromCents(cents(value))]),
  );
  const modifiers = Object.fromEntries(
    Object.entries(inputModifiers).map(([key, value]) => [key, fromCents(cents(value))]),
  );
  const componentTotal = Object.values(components).reduce((sum, value) => sum + cents(value), 0);
  const modifierTotal = Object.values(modifiers).reduce((sum, value) => sum + cents(value), 0);
  const rawTotal = componentTotal + modifierTotal;
  const boundedTotal = Math.max(0, Math.min(cents(100), rawTotal));
  if (boundedTotal !== rawTotal) modifiers.normalization = fromCents(boundedTotal - rawTotal);
  return { totalScore: fromCents(boundedTotal), components, modifiers };
}

function weightedBreakdown(signals: Record<string, number>, weights: object): Record<string, number> {
  const weightMap = weights as Record<string, number>;
  const positiveWeight = Object.values(weightMap).reduce((sum, weight) => sum + Math.max(0, weight), 0) || 1;
  return Object.fromEntries(
    Object.entries(signals).map(([key, signal]) => [key, clamp(signal) * Math.max(0, weightMap[key] ?? 0) / positiveWeight]),
  );
}

function teamCarPerformance(team: NormalizedTeam): number {
  return average([
    team.ratings.power,
    team.ratings.aerodynamics,
    team.ratings.mechanicalGrip,
    team.ratings.tirePreservation,
    team.ratings.reliability,
    team.ratings.pitCrew,
    team.ratings.strategy,
  ]);
}

function potentialEstimate(driver: NormalizedDriver): number {
  return average([driver.potentialMin, driver.potentialMax]);
}

function ageValue(age: number): number {
  if (age <= 20) return 96;
  if (age <= 24) return 96 - (age - 20) * 4;
  if (age <= 29) return 80 - (age - 24) * 2;
  if (age <= 34) return 70 - (age - 29) * 4;
  return Math.max(8, 50 - (age - 34) * 6);
}

function seededModifier(seed: number, scope: string, teamId: string, driverId: string, amplitude: number): number {
  const rng = new DeterministicRng(hashSeed(seed, scope, teamId, driverId));
  return rng.between(-Math.max(0, amplitude), Math.max(0, amplitude));
}

export function calculateDriverOverall(
  driver: NormalizedDriver,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): number {
  const signals: Record<keyof WorldConfig["driverOverallWeights"], number> = {
    racePace: driver.ratings.racePace,
    qualifyingPace: driver.ratings.qualifyingPace,
    consistency: driver.ratings.consistency,
    wetWeather: driver.ratings.wetWeather,
    tireManagement: driver.ratings.tireManagement,
    experience: driver.ratings.experience,
    defending: driver.ratings.defending,
    overtaking: driver.ratings.overtaking,
    adaptability: driver.advancedRatings.adaptability,
    technicalFeedback: driver.advancedRatings.technicalFeedback,
    pressureHandling: driver.advancedRatings.pressureHandling,
  };
  const weights = config.driverOverallWeights;
  const weightTotal = Object.values(weights).reduce((sum, weight) => sum + Math.max(0, weight), 0) || 1;
  const total = Object.entries(signals).reduce(
    (sum, [key, signal]) => sum + clamp(signal) * Math.max(0, weights[key as keyof typeof weights]),
    0,
  ) / weightTotal;
  return fromCents(cents(clamp(total)));
}

export interface TeamStrategyContext {
  constructorPosition: number;
  teamCount: number;
  recentConstructorPosition?: number;
  carPerformance?: number;
  driverQuality?: number;
  availableBudgetCredits?: number;
}

export interface TeamStrategyEvaluation {
  state: TeamStrategyState;
  score: UtilityScoreBreakdown;
  reasons: string[];
}

/** Derive an organizational state from current resources and results. */
export function evaluateTeamStrategy(team: NormalizedTeam, context: TeamStrategyContext): TeamStrategyEvaluation {
  const teamCount = Math.max(2, Math.round(context.teamCount));
  const position = Math.max(1, Math.min(teamCount, Math.round(context.constructorPosition)));
  const recentPosition = Math.max(1, Math.min(teamCount, Math.round(context.recentConstructorPosition ?? position)));
  const positionSignal = ((teamCount - position) / (teamCount - 1)) * 100;
  const recentSignal = ((teamCount - recentPosition) / (teamCount - 1)) * 100;
  const carSignal = clamp(context.carPerformance ?? teamCarPerformance(team));
  const driverSignal = clamp(context.driverQuality ?? carSignal);
  const expectationSignal = clamp(50 + (team.championshipExpectations - position) * 9);
  const availableBudget = context.availableBudgetCredits ?? team.budgetCredits;
  const budgetSignal = team.budgetCredits > 0 ? clamp((availableBudget / team.budgetCredits) * 100) : 0;
  const score = finalizeBreakdown({
    carPerformance: carSignal * 0.34,
    championshipPosition: positionSignal * 0.24,
    driverQuality: driverSignal * 0.14,
    recentResults: recentSignal * 0.1,
    expectation: expectationSignal * 0.08,
    budgetHealth: budgetSignal * 0.1,
  });

  const reasons: string[] = [];
  let state: TeamStrategyState;
  if (budgetSignal < 12 || team.driverBudgetCredits < DEFAULT_WORLD_CONFIG.market.salaryFloorCredits * 2) {
    state = "FINANCIAL_DIFFICULTY";
    reasons.push("Available resources are below the sustainable operating threshold.");
  } else if (position === 1 && carSignal >= 88 && score.totalScore >= 82) {
    state = "DOMINANT";
    reasons.push("The team leads the standings with front-running machinery.");
  } else if (score.totalScore >= 78 || (position <= 2 && carSignal >= 84)) {
    state = "TITLE_CONTENDER";
    reasons.push("Current pace and championship position support a title campaign.");
  } else if (score.totalScore >= 68) {
    state = "CONTENDING";
    reasons.push("The team has competitive pace but is not controlling the championship.");
  } else if (score.totalScore >= 54) {
    state = "MIDFIELD";
    reasons.push("The team is operating in the competitive midfield range.");
  } else if (team.philosophy === "development" && (team.developmentQuality >= 65 || team.academyQuality >= 65)) {
    state = "DEVELOPING";
    reasons.push("Results are weak, but the organization is investing in a development pathway.");
  } else {
    state = "REBUILDING";
    reasons.push("Performance is below expectations and requires a rebuild.");
  }
  return { state, score, reasons };
}

export interface MarketValueContext {
  seasonPerformance?: number;
  marketInterest?: number;
  currentSalaryCredits?: number;
}

export interface MonetaryEvaluation {
  credits: number;
  score: UtilityScoreBreakdown;
}

/** Estimate transferable value without considering whether a driver is real or generated. */
export function calculateDriverMarketValue(
  driver: NormalizedDriver,
  context: MarketValueContext = {},
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): MonetaryEvaluation {
  const overall = calculateDriverOverall(driver, config);
  const score = finalizeBreakdown({
    currentAbility: overall * 0.42,
    potential: potentialEstimate(driver) * 0.18,
    recentPerformance: clamp(context.seasonPerformance ?? driver.form) * 0.14,
    reputation: driver.reputation * 0.12,
    marketability: driver.personality.marketability * 0.08,
    age: ageValue(driver.age) * 0.06,
  }, {
    championshipLeverage: Math.min(8, driver.careerStats.championships * 1.6),
  });
  const credits = Math.max(
    config.market.salaryFloorCredits,
    Math.round(score.totalScore * score.totalScore * (0.9 + Math.min(0.25, driver.careerStats.championships * 0.035))),
  );
  return { credits, score };
}

/** Generate a driver's asking salary from value, leverage, and current pay. */
export function calculateSalaryExpectation(
  driver: NormalizedDriver,
  context: MarketValueContext = {},
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): MonetaryEvaluation {
  const market = calculateDriverMarketValue(driver, context, config);
  const interest = clamp(context.marketInterest ?? 50);
  const currentSalary = Math.max(0, context.currentSalaryCredits ?? 0);
  const score = finalizeBreakdown({
    marketValue: market.score.totalScore * 0.58,
    reputation: driver.reputation * 0.13,
    demand: interest * 0.13,
    moneyMotivation: driver.personality.moneyMotivation * 0.09,
    marketability: driver.personality.marketability * 0.07,
  });
  const calculated = market.credits * (0.68 + score.totalScore / 300);
  const continuityFloor = currentSalary > 0 ? currentSalary * 0.88 : 0;
  return {
    credits: Math.max(config.market.salaryFloorCredits, Math.round(Math.max(calculated, continuityFloor))),
    score,
  };
}

/** Numeric convenience for callers that only need the configured asking price. */
export function salaryExpectation(
  driver: NormalizedDriver,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): number {
  return calculateSalaryExpectation(driver, {}, config).credits;
}

export interface DriverPerformanceInput {
  actualPerformance: number;
  expectedPerformance: number;
  teammatePerformance?: number;
  recentForm?: number;
  previousSeasonPerformance?: number;
  careerPerformance?: number;
}

export interface DriverUtilityContext {
  performance: DriverPerformanceInput;
  salaryDemandCredits?: number;
  availableDriverBudgetCredits?: number;
  scoutedPotentialMin?: number;
  scoutedPotentialMax?: number;
  academyAffiliated?: boolean;
  yearsWithTeam?: number;
  championshipsWithTeam?: number;
  teamFit?: number;
  seed: number;
}

export interface DriverUtilityEvaluation extends UtilityScoreBreakdown {
  signals: {
    machineryRelativePerformance: number;
    teammateComparison: number;
    evaluatedPerformance: number;
    scoutedPotential: number;
    scoutingRange: number;
    salaryDemandCredits: number;
  };
}

function strategyModifier(team: NormalizedTeam, signals: Record<string, number>): number {
  const centered = (name: string) => (signals[name] ?? 50) - 50;
  switch (team.strategyState) {
    case "DOMINANT": return centered("currentPerformance") * 0.045 + centered("experience") * 0.03;
    case "TITLE_CONTENDER": return centered("currentPerformance") * 0.05 + centered("experience") * 0.025;
    case "CONTENDING": return centered("currentPerformance") * 0.035 + centered("potential") * 0.015;
    case "MIDFIELD": return centered("potential") * 0.02 + centered("salaryEfficiency") * 0.02;
    case "REBUILDING": return centered("potential") * 0.04 + centered("age") * 0.025;
    case "DEVELOPING": return centered("potential") * 0.05 + centered("age") * 0.03 + centered("academyStatus") * 0.02;
    case "FINANCIAL_DIFFICULTY": return centered("salaryEfficiency") * 0.06 + centered("marketability") * 0.02;
  }
}

/**
 * Calculate team-specific target utility. Performance is interpreted relative
 * to machinery and the teammate before philosophy weights are applied.
 */
export function calculateDriverUtility(
  team: NormalizedTeam,
  driver: NormalizedDriver,
  context: DriverUtilityContext,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): DriverUtilityEvaluation {
  const actual = clamp(context.performance.actualPerformance);
  const expected = clamp(context.performance.expectedPerformance);
  const machineryRelativePerformance = clamp(50 + (actual - expected) * 1.6);
  const teammateComparison = context.performance.teammatePerformance === undefined
    ? 50
    : clamp(50 + (actual - clamp(context.performance.teammatePerformance)) * 1.35);
  const evaluatedPerformance = clamp(
    actual * 0.32
    + machineryRelativePerformance * 0.38
    + teammateComparison * 0.18
    + clamp(context.performance.recentForm ?? driver.form) * 0.06
    + clamp(context.performance.previousSeasonPerformance ?? driver.reputation) * 0.035
    + clamp(context.performance.careerPerformance ?? driver.reputation) * 0.025,
  );
  const scoutedMinimum = clamp(context.scoutedPotentialMin ?? driver.potentialMin);
  const scoutedMaximum = Math.max(scoutedMinimum, clamp(context.scoutedPotentialMax ?? driver.potentialMax));
  const scoutedPotential = average([scoutedMinimum, scoutedMaximum]);
  const scoutingRange = scoutedMaximum - scoutedMinimum;
  const salaryDemand = Math.max(
    0,
    context.salaryDemandCredits ?? calculateSalaryExpectation(driver, { seasonPerformance: actual }, config).credits,
  );
  const availableBudget = Math.max(1, context.availableDriverBudgetCredits ?? team.driverBudgetCredits);
  const salaryEfficiency = clamp(105 - (salaryDemand / availableBudget) * 100);
  const baseTeamFit = clamp(context.teamFit ?? average([
    driver.personality.teamwork,
    driver.morale,
    100 - driver.pressure,
  ]));
  const signals = {
    currentPerformance: evaluatedPerformance,
    consistency: driver.ratings.consistency,
    experience: driver.ratings.experience,
    potential: scoutedPotential,
    age: ageValue(driver.age),
    academyStatus: context.academyAffiliated ? 100 : 0,
    marketability: driver.personality.marketability,
    salaryEfficiency,
    teamFit: baseTeamFit,
  };
  const familiarity = clamp(
    (context.yearsWithTeam ?? 0) * 0.55
    + (context.championshipsWithTeam ?? 0) * 1.75
    + (context.yearsWithTeam ? driver.personality.loyalty / 35 : 0),
    0,
    8,
  );
  const scoutingUncertainty = -Math.min(
    7,
    scoutingRange * (1 - team.scoutingQuality / 100) * (1.15 - team.riskTolerance / 200),
  );
  const riskAmplitude = 1 + team.riskTolerance / 25;
  const breakdown = finalizeBreakdown(
    weightedBreakdown(signals, config.teamPhilosophyWeights[team.philosophy]),
    {
      strategy: strategyModifier(team, signals),
      familiarity,
      scoutingUncertainty,
      risk: seededModifier(context.seed, "team-driver-utility-v1", team.id, driver.id, riskAmplitude),
    },
  );
  return {
    ...breakdown,
    signals: {
      machineryRelativePerformance: fromCents(cents(machineryRelativePerformance)),
      teammateComparison: fromCents(cents(teammateComparison)),
      evaluatedPerformance: fromCents(cents(evaluatedPerformance)),
      scoutedPotential: fromCents(cents(scoutedPotential)),
      scoutingRange: fromCents(cents(scoutingRange)),
      salaryDemandCredits: Math.round(salaryDemand),
    },
  };
}

export interface ContractOfferInput {
  salaryCredits: number;
  contractYears: number;
  role: Contract["role"];
}

export interface OfferUtilityContext {
  teamCompetitiveness: number;
  championshipProbability: number;
  projectedDevelopment?: number;
  yearsWithTeam?: number;
  currentTeamId?: string;
  currentSalaryCredits?: number;
  marketInterest?: number;
  seed: number;
}

export interface OfferUtilityEvaluation extends UtilityScoreBreakdown {
  expectedSalaryCredits: number;
  careerPhase: DriverCareerPhase;
}

function careerContractFit(phase: DriverCareerPhase, years: number): number {
  const preferredYears: Record<DriverCareerPhase, number> = {
    "early-development": 5,
    "rapid-development": 4,
    "early-prime": 4,
    prime: 3,
    "late-prime": 2,
    decline: 1,
  };
  return clamp(100 - Math.abs(Math.max(1, years) - preferredYears[phase]) * 22);
}

function roleValue(role: Contract["role"]): number {
  if (role === "lead") return 100;
  if (role === "equal") return 78;
  if (role === "support") return 48;
  return 22;
}

/** Evaluate a contract from the driver's autonomous point of view. */
export function calculateOfferUtility(
  driver: NormalizedDriver,
  team: NormalizedTeam,
  offer: ContractOfferInput,
  context: OfferUtilityContext,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): OfferUtilityEvaluation {
  const salary = Math.max(0, offer.salaryCredits);
  const expectedSalary = calculateSalaryExpectation(driver, {
    seasonPerformance: driver.form,
    marketInterest: context.marketInterest,
    currentSalaryCredits: context.currentSalaryCredits,
  }, config).credits;
  // Meeting the asking price is neutral-positive, while a genuinely richer
  // offer still has room to separate itself for a money-motivated driver.
  const salaryScore = clamp(50 + (salary / Math.max(1, expectedSalary) - 1) * 50);
  const competitiveness = clamp(context.teamCompetitiveness);
  const championship = clamp(context.championshipProbability);
  const prestige = team.prestige;
  const contractFit = careerContractFit(driver.careerPhase, offer.contractYears);
  const role = roleValue(offer.role);
  const loyalty = context.currentTeamId === team.id
    ? clamp(50 + driver.personality.loyalty / 2 + (context.yearsWithTeam ?? 0) * 3)
    : 35;
  const rebuilding = team.strategyState === "REBUILDING" || team.strategyState === "DEVELOPING";
  const project = rebuilding
    ? clamp((context.projectedDevelopment ?? team.developmentQuality) * 0.65 + driver.personality.riskTolerance * 0.35)
    : clamp(65 + competitiveness * 0.35);
  const ambition = driver.personality.ambition / 100;
  const money = driver.personality.moneyMotivation / 100;
  const patience = driver.personality.patience / 100;
  const loyaltyTrait = driver.personality.loyalty / 100;
  const risk = driver.personality.riskTolerance / 100;
  const weights = {
    salary: 0.08 + money * 0.75,
    competitiveness: 0.1 + ambition * 0.28,
    prestige: 0.04 + ambition * 0.12,
    championship: 0.05 + ambition * 0.24,
    contractLength: 0.05 + patience * 0.07,
    role: 0.06 + ambition * 0.04,
    loyalty: 0.04 + loyaltyTrait * 0.14,
    project: 0.03 + risk * 0.07,
  };
  const components = weightedBreakdown({
    salary: salaryScore,
    competitiveness,
    prestige,
    championship,
    contractLength: contractFit,
    role,
    loyalty,
    project,
  }, weights);
  const breakdown = finalizeBreakdown(components, {
    risk: seededModifier(context.seed, "driver-offer-utility-v1", team.id, driver.id, 0.5 + risk * 2.5),
  });
  return { ...breakdown, expectedSalaryCredits: expectedSalary, careerPhase: driver.careerPhase };
}

export type RenewalDecision = "RENEW" | "WAIT" | "REPLACE";

export interface RenewalDecisionContext {
  incumbentUtility: number;
  bestAlternativeUtility?: number;
  teamConfidence: number;
  contractYearsRemaining: number;
  seasonProgress: number;
  yearsWithTeam?: number;
  replacementUtilityDifferenceRequired?: number;
}

export interface RenewalDecisionEvaluation {
  decision: RenewalDecision;
  score: UtilityScoreBreakdown;
  replacementGap: number;
  reasons: string[];
}

/** Apply stability and replacement thresholds to a team's renewal decision. */
export function evaluateRenewalDecision(
  driver: NormalizedDriver,
  context: RenewalDecisionContext,
): RenewalDecisionEvaluation {
  const incumbent = clamp(context.incumbentUtility);
  const alternative = clamp(context.bestAlternativeUtility ?? 0);
  const confidence = clamp(context.teamConfidence);
  const progress = clamp(context.seasonProgress, 0, 1);
  const remaining = Math.max(0, Math.round(context.contractYearsRemaining));
  const threshold = Math.max(0, context.replacementUtilityDifferenceRequired ?? 5);
  const replacementGap = fromCents(cents(alternative - incumbent));
  const continuity = clamp(
    45 + (context.yearsWithTeam ?? 0) * 5 + driver.personality.loyalty * 0.25,
  );
  const score = finalizeBreakdown({
    incumbentUtility: incumbent * 0.5,
    teamConfidence: confidence * 0.28,
    continuity: continuity * 0.14,
    contractSecurity: (remaining > 0 ? 80 : 35) * 0.08,
  }, {
    alternativePressure: -Math.max(0, replacementGap) * 0.45,
  });
  const reasons: string[] = [];
  let decision: RenewalDecision;
  if (driver.status === "retired") {
    decision = "REPLACE";
    reasons.push("The driver is retired and cannot occupy an active seat.");
  } else if (replacementGap >= threshold && (remaining === 0 || confidence < 40 || progress >= 0.7)) {
    decision = "REPLACE";
    reasons.push(`The best alternative clears the replacement threshold by ${replacementGap.toFixed(1)} points.`);
  } else if (remaining > 0) {
    decision = "WAIT";
    reasons.push("The active contract provides time for further evaluation.");
  } else if (progress < 0.55) {
    decision = "WAIT";
    reasons.push("The season sample is not mature enough for a final renewal decision.");
  } else if (confidence >= 48 && score.totalScore >= 48) {
    decision = "RENEW";
    reasons.push("Performance, confidence, and continuity support a renewal.");
  } else if (context.bestAlternativeUtility !== undefined) {
    decision = "REPLACE";
    reasons.push("The expiring relationship no longer meets the team's renewal standard.");
  } else {
    decision = "WAIT";
    reasons.push("No acceptable replacement is currently available.");
  }
  return { decision, score, replacementGap, reasons };
}

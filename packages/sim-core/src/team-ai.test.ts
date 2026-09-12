import { describe, expect, it } from "vitest";
import { createUniverse, normalizeUniverse, PRESET_2026 } from "./index";
import {
  calculateDriverMarketValue,
  calculateDriverOverall,
  calculateDriverUtility,
  calculateOfferUtility,
  calculateSalaryExpectation,
  evaluateRenewalDecision,
  evaluateTeamStrategy,
} from "./team-ai";
import type { NormalizedDriver, NormalizedTeam, UtilityScoreBreakdown } from "./types";

function fixture(): { driver: NormalizedDriver; team: NormalizedTeam } {
  const universe = normalizeUniverse(createUniverse(PRESET_2026, { seed: 2026 }));
  return { driver: universe.season.drivers[0]!, team: universe.season.teams[0]! };
}

function reconcile(score: UtilityScoreBreakdown): number {
  return Math.round((
    Object.values(score.components).reduce((sum, value) => sum + value, 0)
    + Object.values(score.modifiers ?? {}).reduce((sum, value) => sum + value, 0)
  ) * 100);
}

function performance(actualPerformance = 80, expectedPerformance = 70) {
  return { actualPerformance, expectedPerformance, teammatePerformance: 72, recentForm: 76 };
}

describe("team AI utility layer", () => {
  it("calculates a configured overall without using real/generated identity", () => {
    const { driver } = fixture();
    const generated = { ...structuredClone(driver), generatedDriver: true };
    const real = { ...structuredClone(driver), generatedDriver: false };
    expect(calculateDriverOverall(generated)).toBe(calculateDriverOverall(real));
    expect(calculateDriverOverall(driver)).toBeGreaterThanOrEqual(0);
    expect(calculateDriverOverall(driver)).toBeLessThanOrEqual(100);
  });

  it("derives dynamic team states from competitiveness and financial health", () => {
    const { team } = fixture();
    const dominant = structuredClone(team);
    for (const field of Object.keys(dominant.ratings) as Array<keyof typeof dominant.ratings>) dominant.ratings[field] = 95;
    dominant.championshipExpectations = 1;
    expect(evaluateTeamStrategy(dominant, { constructorPosition: 1, teamCount: 10, driverQuality: 94 }).state).toBe("DOMINANT");

    const insolvent = structuredClone(team);
    expect(evaluateTeamStrategy(insolvent, { constructorPosition: 4, teamCount: 10, availableBudgetCredits: 0 }).state).toBe("FINANCIAL_DIFFICULTY");

    const developing = structuredClone(team);
    developing.philosophy = "development";
    developing.developmentQuality = 85;
    for (const field of Object.keys(developing.ratings) as Array<keyof typeof developing.ratings>) developing.ratings[field] = 50;
    expect(evaluateTeamStrategy(developing, { constructorPosition: 10, teamCount: 10, driverQuality: 50 }).state).toBe("DEVELOPING");
  });

  it("produces auditable market value and salary estimates", () => {
    const { driver } = fixture();
    const quietMarket = calculateSalaryExpectation(driver, { marketInterest: 10 });
    const biddingWar = calculateSalaryExpectation(driver, { marketInterest: 100 });
    const marketValue = calculateDriverMarketValue(driver, { seasonPerformance: 85 });
    expect(biddingWar.credits).toBeGreaterThan(quietMarket.credits);
    expect(marketValue.credits).toBeGreaterThan(0);
    expect(reconcile(marketValue.score)).toBe(Math.round(marketValue.score.totalScore * 100));
    expect(reconcile(biddingWar.score)).toBe(Math.round(biddingWar.score.totalScore * 100));
  });

  it("rewards performance relative to machinery and penalizes expensive targets", () => {
    const { driver, team } = fixture();
    const overachiever = calculateDriverUtility(team, driver, {
      performance: performance(76, 58), salaryDemandCredits: 5_000, seed: 9,
    });
    const underachiever = calculateDriverUtility(team, driver, {
      performance: performance(76, 90), salaryDemandCredits: 5_000, seed: 9,
    });
    const expensive = calculateDriverUtility(team, driver, {
      performance: performance(76, 58), salaryDemandCredits: team.driverBudgetCredits, seed: 9,
    });
    expect(overachiever.signals.machineryRelativePerformance).toBeGreaterThan(underachiever.signals.machineryRelativePerformance);
    expect(overachiever.totalScore).toBeGreaterThan(underachiever.totalScore);
    expect(overachiever.totalScore).toBeGreaterThan(expensive.totalScore);
    expect(reconcile(overachiever)).toBe(Math.round(overachiever.totalScore * 100));
  });

  it("uses philosophy, academy, scouting, and familiarity in team-specific rankings", () => {
    const { driver, team } = fixture();
    const veteran = structuredClone(driver);
    veteran.age = 32;
    veteran.potentialMin = 84;
    veteran.potentialMax = 86;
    veteran.ratings.racePace = 94;
    veteran.ratings.consistency = 95;
    veteran.ratings.experience = 98;
    const prospect = structuredClone(driver);
    prospect.id = "prospect";
    prospect.age = 20;
    prospect.potentialMin = 95;
    prospect.potentialMax = 99;
    prospect.ratings.racePace = 73;
    prospect.ratings.consistency = 72;
    prospect.ratings.experience = 55;

    const titleTeam = { ...structuredClone(team), philosophy: "championship" as const, strategyState: "TITLE_CONTENDER" as const };
    const developmentTeam = { ...structuredClone(team), philosophy: "development" as const, strategyState: "DEVELOPING" as const };
    const veteranTitleScore = calculateDriverUtility(titleTeam, veteran, { performance: performance(92, 88), salaryDemandCredits: 5_000, seed: 4 }).totalScore;
    const prospectTitleScore = calculateDriverUtility(titleTeam, prospect, { performance: performance(74, 72), salaryDemandCredits: 5_000, seed: 4 }).totalScore;
    const veteranDevelopmentScore = calculateDriverUtility(developmentTeam, veteran, { performance: performance(92, 88), salaryDemandCredits: 5_000, seed: 4 }).totalScore;
    const prospectDevelopmentScore = calculateDriverUtility(developmentTeam, prospect, { performance: performance(74, 72), salaryDemandCredits: 5_000, academyAffiliated: true, seed: 4 }).totalScore;
    expect(veteranTitleScore).toBeGreaterThan(prospectTitleScore);
    expect(prospectDevelopmentScore).toBeGreaterThan(veteranDevelopmentScore);

    const uncertain = calculateDriverUtility(developmentTeam, prospect, {
      performance: performance(), salaryDemandCredits: 5_000, scoutedPotentialMin: 70, scoutedPotentialMax: 100, seed: 17,
    });
    const knownAndFamiliar = calculateDriverUtility(developmentTeam, prospect, {
      performance: performance(), salaryDemandCredits: 5_000, scoutedPotentialMin: 85, scoutedPotentialMax: 85,
      academyAffiliated: true, yearsWithTeam: 4, championshipsWithTeam: 1, seed: 17,
    });
    expect(knownAndFamiliar.totalScore).toBeGreaterThan(uncertain.totalScore);
  });

  it("keeps risk modifiers seeded and bounded by team risk tolerance", () => {
    const { driver, team } = fixture();
    const lowRisk = { ...structuredClone(team), riskTolerance: 0 };
    const highRisk = { ...structuredClone(team), riskTolerance: 100 };
    const a = calculateDriverUtility(lowRisk, driver, { performance: performance(), salaryDemandCredits: 5_000, seed: 123 });
    const b = calculateDriverUtility(lowRisk, driver, { performance: performance(), salaryDemandCredits: 5_000, seed: 123 });
    const c = calculateDriverUtility(highRisk, driver, { performance: performance(), salaryDemandCredits: 5_000, seed: 123 });
    expect(a).toEqual(b);
    expect(Math.abs(a.modifiers?.risk ?? 99)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.modifiers?.risk ?? 99)).toBeLessThanOrEqual(5);
  });

  it("lets ambition and money motivation materially change offer preference", () => {
    const { driver, team } = fixture();
    const contender = { ...structuredClone(team), id: "contender", prestige: 95, strategyState: "TITLE_CONTENDER" as const };
    const backmarker = { ...structuredClone(team), id: "backmarker", prestige: 45, strategyState: "REBUILDING" as const };
    const ambitious = structuredClone(driver);
    ambitious.personality.ambition = 100;
    ambitious.personality.moneyMotivation = 0;
    const moneyDriven = structuredClone(driver);
    moneyDriven.personality.ambition = 0;
    moneyDriven.personality.moneyMotivation = 100;
    const expected = calculateSalaryExpectation(driver).credits;
    const contenderOffer = { salaryCredits: expected, contractYears: 3, role: "equal" as const };
    const richOffer = { salaryCredits: expected * 2, contractYears: 3, role: "lead" as const };
    const ambitiousContender = calculateOfferUtility(ambitious, contender, contenderOffer, { teamCompetitiveness: 95, championshipProbability: 85, seed: 2 }).totalScore;
    const ambitiousBackmarker = calculateOfferUtility(ambitious, backmarker, richOffer, { teamCompetitiveness: 35, championshipProbability: 5, seed: 2 }).totalScore;
    const moneyContender = calculateOfferUtility(moneyDriven, contender, contenderOffer, { teamCompetitiveness: 95, championshipProbability: 85, seed: 2 }).totalScore;
    const moneyBackmarker = calculateOfferUtility(moneyDriven, backmarker, richOffer, { teamCompetitiveness: 35, championshipProbability: 5, seed: 2 }).totalScore;
    expect(ambitiousContender).toBeGreaterThan(ambitiousBackmarker);
    expect(moneyBackmarker).toBeGreaterThan(moneyContender);
    expect(reconcile(calculateOfferUtility(ambitious, contender, contenderOffer, { teamCompetitiveness: 95, championshipProbability: 85, seed: 2 }))).toBe(Math.round(ambitiousContender * 100));
  });

  it("returns stable RENEW, WAIT, and REPLACE decisions with exact explanations", () => {
    const { driver } = fixture();
    const wait = evaluateRenewalDecision(driver, {
      incumbentUtility: 70, bestAlternativeUtility: 72, teamConfidence: 70, contractYearsRemaining: 1, seasonProgress: 0.8,
    });
    const renew = evaluateRenewalDecision(driver, {
      incumbentUtility: 78, bestAlternativeUtility: 80, teamConfidence: 82, contractYearsRemaining: 0, seasonProgress: 0.9,
    });
    const replace = evaluateRenewalDecision(driver, {
      incumbentUtility: 55, bestAlternativeUtility: 70, teamConfidence: 32, contractYearsRemaining: 0, seasonProgress: 0.9,
    });
    expect(wait.decision).toBe("WAIT");
    expect(renew.decision).toBe("RENEW");
    expect(replace.decision).toBe("REPLACE");
    expect(reconcile(replace.score)).toBe(Math.round(replace.score.totalScore * 100));
  });
});

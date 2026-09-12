import { normalizeUniverse } from "./migrations";
import type {
  CarState,
  CompletedWeekend,
  DriverSeasonPerformance,
  DriverWeekendPerformance,
  HeadToHeadRecord,
  NormalizedUniverse,
  PerformanceExclusionReason,
  PerformanceEvaluationConfig,
  RelativeToMachineryScore,
  SeasonPerformance,
  TeammateComparison,
  Universe,
} from "./types";

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceEvaluationConfig = {
  rollingWindowRaces: 5,
  baselineTeamConfidence: 50,
  maximumConfidenceMovementPerRace: 4,
  confidenceSensitivity: 0.16,
  raceWeight: 0.58,
  qualifyingWeight: 0.18,
  teammateWeight: 0.24,
  driverIncidentPenalty: 10,
  unexpectedPodiumBonus: 5,
  formBaselineWeight: 0.2,
  machineryExpectationWeight: 0.42,
  driverExpectationWeight: 0.38,
  gridContextWeight: 0.2,
  teammateQualifyingWeight: 0.4,
  teammateRaceWeight: 0.45,
  teammatePointsWeight: 0.15,
  incompleteRaceConfidenceMultiplier: 0.45,
  resultPositionScale: 5.2,
  qualifyingPositionScale: 4,
  teammatePositionScale: 5,
  teammatePointsScale: 2,
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const average = (values: number[], fallback = 50) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
const weightedAverage = (values: Array<{ value: number; weight: number }>, fallback = 50) => {
  const usable = values.filter((entry) => entry.weight > 0 && Number.isFinite(entry.value));
  const totalWeight = usable.reduce((sum, entry) => sum + entry.weight, 0);
  return totalWeight > 0
    ? usable.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight
    : fallback;
};

function carRating(universe: Universe, teamId: string): number {
  const team = universe.season.teams.find((candidate) => candidate.id === teamId);
  if (!team) return 50;
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

function driverAbility(universe: Universe, driverId: string): number {
  const driver = universe.season.drivers.find((candidate) => candidate.id === driverId);
  if (!driver) return 50;
  return average([
    driver.ratings.racePace,
    driver.ratings.qualifyingPace,
    driver.ratings.consistency,
    driver.ratings.overtaking,
    driver.ratings.defending,
    driver.ratings.experience,
  ]);
}

function machineryRank(universe: Universe, teamId: string): number {
  const order = [...universe.season.teams].sort((a, b) => carRating(universe, b.id) - carRating(universe, a.id) || a.id.localeCompare(b.id));
  return Math.max(1, order.findIndex((team) => team.id === teamId) + 1);
}

/**
 * Values that are invariant while a season review is being built.  The old
 * implementation rebuilt these sorted lists for every driver at every round,
 * which made the end-of-weekend recalculation grow quadratically with the
 * number of completed races.
 */
interface PerformanceContext {
  machineryByTeamId: Map<string, number>;
  machineryRankByTeamId: Map<string, number>;
  driverExpectedPositionById: Map<string, number>;
}

function buildPerformanceContext(universe: Universe): PerformanceContext {
  const machineryByTeamId = new Map(universe.season.teams.map((team) => [team.id, carRating(universe, team.id)]));
  const machineryRankByTeamId = new Map(
    [...universe.season.teams]
      .sort((a, b) => (machineryByTeamId.get(b.id) ?? 50) - (machineryByTeamId.get(a.id) ?? 50) || a.id.localeCompare(b.id))
      .map((team, index) => [team.id, index + 1]),
  );
  const activeDriverIds = new Set(universe.season.teams.flatMap((team) => team.driverIds));
  const driverExpectedPositionById = new Map(
    universe.season.drivers
      .filter((driver) => activeDriverIds.has(driver.id))
      .sort((a, b) => driverAbility(universe, b.id) - driverAbility(universe, a.id) || a.id.localeCompare(b.id))
      .map((driver, index) => [driver.id, index + 1]),
  );
  return { machineryByTeamId, machineryRankByTeamId, driverExpectedPositionById };
}

function attribution(result: { status: CarState["status"]; reason?: string }): "none" | "mechanical" | "driver" | "other" {
  if (result.status === "finished" || result.status === "nc") return "none";
  const reason = (result.reason ?? "").toLowerCase();
  if (/accident|crash|collision|contact|spin|damage|driver/.test(reason)) return "driver";
  if (/mechanical|engine|power unit|hydraulic|gearbox|electrical|suspension|reliability|puncture/.test(reason)) return "mechanical";
  return "other";
}

function exclusion(status: CarState["status"], reason: string | undefined, kind: "race" | "qualifying"): PerformanceExclusionReason | undefined {
  if (status === "dns") return "dns";
  if (status === "dq") return "dq";
  if (status !== "dnf" || kind === "qualifying") return undefined;
  const cause = attribution({ status, reason });
  if (cause === "mechanical") return "mechanical-dnf";
  if (cause === "driver") return undefined;
  return reason ? "unattributed-dnf" : "missing-result";
}

function expectedResult(
  universe: Universe,
  driverId: string,
  teamId: string,
  fieldSize: number,
  config: PerformanceEvaluationConfig,
  gridPosition?: number,
  context?: PerformanceContext,
): { expectedPosition: number; machineryExpectedPosition: number; machinery: number; rank: number } {
  const rank = context?.machineryRankByTeamId.get(teamId) ?? machineryRank(universe, teamId);
  const machinery = context?.machineryByTeamId.get(teamId) ?? carRating(universe, teamId);
  const machineryExpectedPosition = rank * 2 - 0.5;
  const driverExpectedPosition = context?.driverExpectedPositionById.get(driverId) ?? fieldSize / 2 + 0.5;
  const expectedPosition = clamp(weightedAverage([
    { value: machineryExpectedPosition, weight: config.machineryExpectationWeight },
    { value: driverExpectedPosition, weight: config.driverExpectationWeight },
    { value: gridPosition ?? 0, weight: gridPosition === undefined ? 0 : config.gridContextWeight },
  ], machineryExpectedPosition), 1, Math.max(1, fieldSize));
  return { expectedPosition, machineryExpectedPosition, machinery, rank };
}

function relativeScore(
  universe: Universe,
  result: { position: number; status: CarState["status"]; reason?: string },
  driverId: string,
  teamId: string,
  fieldSize: number,
  config: PerformanceEvaluationConfig,
  gridPosition?: number,
  context?: PerformanceContext,
): RelativeToMachineryScore {
  const expected = expectedResult(universe, driverId, teamId, fieldSize, config, gridPosition, context);
  const exclusionReason = exclusion(result.status, result.reason, "race");
  if (exclusionReason) {
    return { machineryRank: expected.rank, machineryRating: expected.machinery, machineryExpectedPosition: expected.machineryExpectedPosition, expectedPosition: expected.expectedPosition, actualPosition: result.position, score: 50, eligible: false, exclusionReason };
  }
  const positionDelta = expected.expectedPosition - result.position;
  return {
    machineryRank: expected.rank,
    machineryRating: expected.machinery,
    machineryExpectedPosition: expected.machineryExpectedPosition,
    expectedPosition: expected.expectedPosition,
    actualPosition: result.position,
    positionDelta,
    score: clamp(50 + positionDelta * config.resultPositionScale),
    eligible: true,
  };
}

function emptyH2H(): HeadToHeadRecord { return { wins: 0, losses: 0, ties: 0 }; }

function compareTeammates(
  weekend: CompletedWeekend,
  raceResult: NonNullable<CompletedWeekend["race"]>[number],
  qualifyingResult: NonNullable<CompletedWeekend["qualifying"]>[number] | undefined,
  config: PerformanceEvaluationConfig,
): TeammateComparison {
  const teammateRace = weekend.race.find((entry) => entry.teamId === raceResult.teamId && entry.driverId !== raceResult.driverId);
  const teammateQualifying = weekend.qualifying.find((entry) => entry.teamId === raceResult.teamId && entry.driverId !== raceResult.driverId);
  const excludedReasons: PerformanceExclusionReason[] = [];
  const raceExclusion = exclusion(raceResult.status, raceResult.reason, "race");
  const teammateRaceExclusion = teammateRace && exclusion(teammateRace.status, teammateRace.reason, "race");
  const qualifyingExclusion = qualifyingResult && exclusion(qualifyingResult.status, undefined, "qualifying");
  const teammateQualifyingExclusion = teammateQualifying && exclusion(teammateQualifying.status, undefined, "qualifying");
  if (raceExclusion) excludedReasons.push(raceExclusion);
  if (teammateRaceExclusion) excludedReasons.push(teammateRaceExclusion);
  if (qualifyingExclusion) excludedReasons.push(qualifyingExclusion);
  if (teammateQualifyingExclusion) excludedReasons.push(teammateQualifyingExclusion);
  const raceEligible = Boolean(teammateRace && !raceExclusion && !teammateRaceExclusion);
  const qualifyingEligible = Boolean(qualifyingResult && teammateQualifying && !qualifyingExclusion && !teammateQualifyingExclusion);
  const qualifyingPositionDelta = qualifyingEligible && teammateQualifying && qualifyingResult ? teammateQualifying.position - qualifyingResult.position : undefined;
  const racePositionDelta = raceEligible && teammateRace ? teammateRace.position - raceResult.position : undefined;
  const pointsDelta = raceEligible && teammateRace ? raceResult.points - teammateRace.points : undefined;
  const score = weightedAverage([
    { value: qualifyingPositionDelta === undefined ? 0 : clamp(50 + qualifyingPositionDelta * config.teammatePositionScale), weight: qualifyingPositionDelta === undefined ? 0 : config.teammateQualifyingWeight },
    { value: racePositionDelta === undefined ? 0 : clamp(50 + racePositionDelta * config.teammatePositionScale), weight: racePositionDelta === undefined ? 0 : config.teammateRaceWeight },
    { value: pointsDelta === undefined ? 0 : clamp(50 + pointsDelta * config.teammatePointsScale), weight: pointsDelta === undefined ? 0 : config.teammatePointsWeight },
  ]);
  return {
    teammateId: teammateRace?.driverId ?? teammateQualifying?.driverId,
    eligible: raceEligible || qualifyingEligible,
    qualifyingEligible,
    raceEligible,
    qualifyingPositionDelta,
    racePositionDelta,
    pointsDelta,
    qualifyingResult: qualifyingPositionDelta === undefined ? undefined : qualifyingPositionDelta > 0 ? "win" : qualifyingPositionDelta < 0 ? "loss" : "tie",
    raceResult: racePositionDelta === undefined ? undefined : racePositionDelta > 0 ? "win" : racePositionDelta < 0 ? "loss" : "tie",
    score,
    excludedReasons: [...new Set(excludedReasons)],
  };
}

function raceEntryForDriver(weekend: CompletedWeekend, driverId: string) {
  return weekend.race.find((entry) => entry.driverId === driverId);
}

function qualifyingEntryForDriver(weekend: CompletedWeekend, driverId: string) {
  return weekend.qualifying.find((entry) => entry.driverId === driverId);
}

function emptyDriverPerformance(driverId: string, baseline: number): DriverSeasonPerformance {
  return {
    driverId,
    starts: 0,
    validFinishes: 0,
    mechanicalDnfs: 0,
    driverIncidents: 0,
    points: 0,
    pointsPerValidFinish: 0,
    averageRelativeToMachinery: baseline,
    averageWeekendScore: baseline,
    rollingForm: baseline,
    teamConfidenceByTeamId: {},
    qualifyingHeadToHead: emptyH2H(),
    raceHeadToHead: emptyH2H(),
    weekends: [],
  };
}

function addH2H(record: HeadToHeadRecord, outcome: "win" | "loss" | "tie" | undefined): void {
  if (outcome === "win") record.wins += 1;
  else if (outcome === "loss") record.losses += 1;
  else if (outcome === "tie") record.ties += 1;
}

interface DriverSampleTotals {
  qualifyingSum: number;
  qualifyingCount: number;
  finishSum: number;
  finishCount: number;
  relativeSum: number;
  relativeCount: number;
  weekendSum: number;
  weekendCount: number;
}

function emptyDriverSampleTotals(): DriverSampleTotals {
  return { qualifyingSum: 0, qualifyingCount: 0, finishSum: 0, finishCount: 0, relativeSum: 0, relativeCount: 0, weekendSum: 0, weekendCount: 0 };
}

/** Build the season review used by confidence, renewals and storytelling. */
export function evaluateSeasonPerformance(
  input: Universe,
  config: PerformanceEvaluationConfig = DEFAULT_PERFORMANCE_CONFIG,
): SeasonPerformance {
  const universe = normalizeUniverse(input);
  return evaluateNormalizedSeasonPerformance(universe, config);
}

function evaluateNormalizedSeasonPerformance(
  universe: NormalizedUniverse,
  config: PerformanceEvaluationConfig,
): SeasonPerformance {
  const baseline = config.baselineTeamConfidence;
  const priorPerformance = universe.season.performance?.season === universe.season.year ? universe.season.performance : undefined;
  const drivers: Record<string, DriverSeasonPerformance> = Object.fromEntries(
    universe.season.drivers.map((driver) => [driver.id, emptyDriverPerformance(driver.id, baseline)]),
  );
  const totals = new Map<string, DriverSampleTotals>(universe.season.drivers.map((driver) => [driver.id, emptyDriverSampleTotals()]));
  const confidence = new Map<string, number>();
  const completed = universe.season.completedWeekends
    .filter((weekend) => !weekend.voided)
    .sort((a, b) => a.weekend.round - b.weekend.round || a.weekend.id.localeCompare(b.weekend.id));
  const fieldSize = Math.max(2, universe.season.teams.length * 2);
  const context = buildPerformanceContext(universe);

  for (const weekend of completed) {
    for (const result of weekend.race) {
      const review = drivers[result.driverId] ?? (drivers[result.driverId] = emptyDriverPerformance(result.driverId, baseline));
      const sampleTotals = totals.get(result.driverId) ?? emptyDriverSampleTotals();
      totals.set(result.driverId, sampleTotals);
      const qualifying = qualifyingEntryForDriver(weekend, result.driverId);
      const relative = relativeScore(universe, result, result.driverId, result.teamId, fieldSize, config, qualifying?.position, context);
      const teammate = compareTeammates(weekend, result, qualifying, config);
      const raceValid = result.status === "finished" || result.status === "nc";
      const attributionType = attribution(result);
      if (raceValid) review.validFinishes += 1;
      if (result.status !== "dns") review.starts += 1;
      if (attributionType === "mechanical") review.mechanicalDnfs += 1;
      if (attributionType === "driver") review.driverIncidents += 1;
      review.points += result.points;
      if (qualifying?.position !== undefined) {
        sampleTotals.qualifyingSum += qualifying.position;
        sampleTotals.qualifyingCount += 1;
        review.averageQualifyingPosition = sampleTotals.qualifyingSum / sampleTotals.qualifyingCount;
      }
      if (raceValid) {
        sampleTotals.finishSum += result.position;
        sampleTotals.finishCount += 1;
        review.averageFinishingPosition = sampleTotals.finishSum / sampleTotals.finishCount;
      }
      if (relative.eligible) {
        sampleTotals.relativeSum += relative.score;
        sampleTotals.relativeCount += 1;
        review.averageRelativeToMachinery = sampleTotals.relativeSum / sampleTotals.relativeCount;
      }
      const qualifyingScore = qualifying ? clamp(50 + (expectedResult(universe, result.driverId, result.teamId, fieldSize, config, undefined, context).expectedPosition - qualifying.position) * config.qualifyingPositionScale) : 50;
      const teammateScore = teammate.eligible ? teammate.score : 50;
      let weekendScore = relative.score * config.raceWeight + qualifyingScore * config.qualifyingWeight + teammateScore * config.teammateWeight;
      if (attributionType === "driver") weekendScore -= config.driverIncidentPenalty;
      if (raceValid && result.position <= 3 && relative.machineryRank >= 5) weekendScore += config.unexpectedPodiumBonus;
      weekendScore = clamp(weekendScore);
      const confidenceKey = `${result.driverId}:${result.teamId}`;
      const previousConfidence = confidence.get(confidenceKey) ?? baseline;
      const sampleMultiplier = relative.eligible ? 1 : config.incompleteRaceConfidenceMultiplier;
      const confidenceDelta = clamp((weekendScore - baseline) * config.confidenceSensitivity * sampleMultiplier, -config.maximumConfidenceMovementPerRace, config.maximumConfidenceMovementPerRace);
      const nextConfidence = clamp(previousConfidence + confidenceDelta);
      confidence.set(confidenceKey, nextConfidence);
      review.teamConfidenceByTeamId[result.teamId] = nextConfidence;
      sampleTotals.weekendSum += weekendScore;
      sampleTotals.weekendCount += 1;
      review.averageWeekendScore = sampleTotals.weekendSum / sampleTotals.weekendCount;
      review.weekends.push({
        weekendId: weekend.weekend.id,
        round: weekend.weekend.round,
        teamId: result.teamId,
        qualifyingPosition: qualifying?.position,
        racePosition: result.position,
        raceStatus: result.status,
        points: result.points,
        retirementAttribution: attributionType,
        relativeToMachinery: relative,
        teammateComparison: teammate,
        weekendScore,
        confidenceDelta,
      });
      addH2H(review.qualifyingHeadToHead, teammate.qualifyingResult);
      addH2H(review.raceHeadToHead, teammate.raceResult);
    }
  }

  for (const review of Object.values(drivers)) {
    review.pointsPerValidFinish = review.validFinishes ? review.points / review.validFinishes : 0;
    const last = review.weekends.slice(-Math.max(1, config.rollingWindowRaces));
    const recentMean = average(last.map((entry) => entry.weekendScore), baseline);
    const priorBaseline = priorPerformance?.baselineFormByDriverId[review.driverId] ?? universe.season.drivers.find((driver) => driver.id === review.driverId)?.form ?? baseline;
    review.rollingForm = last.length === 0 ? priorBaseline : priorBaseline * config.formBaselineWeight + recentMean * (1 - config.formBaselineWeight);
    const qDeltas = review.weekends.map((entry) => entry.teammateComparison.qualifyingPositionDelta).filter((delta): delta is number => delta !== undefined);
    const rDeltas = review.weekends.map((entry) => entry.teammateComparison.racePositionDelta).filter((delta): delta is number => delta !== undefined);
    review.averageQualifyingTeammateDelta = qDeltas.length ? average(qDeltas) : undefined;
    review.averageRaceTeammateDelta = rDeltas.length ? average(rDeltas) : undefined;
  }
  return {
    version: 1,
    season: universe.season.year,
    evaluatedThroughRound: completed.at(-1)?.weekend.round ?? 0,
    baselineFormByDriverId: Object.fromEntries(universe.season.drivers.map((driver) => [driver.id, priorPerformance?.baselineFormByDriverId[driver.id] ?? driver.form])),
    drivers,
  };
}

/** Persist the review and expose capped form/confidence to the next race. */
export function recalculateSeasonPerformanceInPlace(
  universe: NormalizedUniverse,
  config: PerformanceEvaluationConfig = DEFAULT_PERFORMANCE_CONFIG,
): NormalizedUniverse {
  universe.season.performance = evaluateNormalizedSeasonPerformance(universe, config);
  for (const driver of universe.season.drivers) {
    const review = universe.season.performance.drivers[driver.id];
    if (!review) continue;
    driver.form = Math.round(clamp(review.rollingForm));
    const teamId = universe.season.teams.find((team) => team.driverIds.includes(driver.id))?.id;
    const confidence = teamId ? review.teamConfidenceByTeamId[teamId] : undefined;
    if (confidence !== undefined) {
      const team = universe.season.teams.find((candidate) => candidate.id === teamId);
      if (team) team.driverConfidence ??= {};
      if (team) team.driverConfidence![driver.id] = Math.round(confidence);
    }
  }
  return universe;
}

/** Normalize a public input and then persist its performance review. */
export function recalculateSeasonPerformance(input: Universe, config: PerformanceEvaluationConfig = DEFAULT_PERFORMANCE_CONFIG): NormalizedUniverse {
  return recalculateSeasonPerformanceInPlace(normalizeUniverse(input), config);
}

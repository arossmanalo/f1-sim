import { calculateDriverOverall, calculateDriverUtility, calculateOfferUtility, calculateSalaryExpectation, evaluateRenewalDecision } from "./team-ai";
import { normalizeUniverse } from "./migrations";
import type { AiDecision, Contract, NormalizedDriver, NormalizedTeam, NormalizedUniverse, Universe } from "./types";

export interface MarketResolutionSummary {
  targetSeason: number;
  renewed: string[];
  signed: string[];
  released: string[];
  declined: string[];
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

function timestamp(season: number, index: number): string {
  return new Date(Date.UTC(season, 0, 10, 0, index)).toISOString();
}

function teamPerformance(team: NormalizedTeam): number {
  const fields = ["power", "aerodynamics", "mechanicalGrip", "tirePreservation", "reliability", "pitCrew", "strategy"] as const;
  return fields.reduce((sum, field) => sum + team.ratings[field], 0) / fields.length;
}

function driverPerformance(universe: NormalizedUniverse, driver: NormalizedDriver): number {
  const review = universe.season.performance?.drivers[driver.id];
  return clamp(review?.rollingForm ?? driver.form);
}

function currentContract(universe: NormalizedUniverse, driverId: string, teamId: string): Contract | undefined {
  return universe.season.contracts
    .filter((contract) => contract.driverId === driverId && contract.teamId === teamId && (contract.status === "active" || contract.status === "agreed"))
    .sort((a, b) => b.endSeason - a.endSeason || b.startSeason - a.startSeason)[0];
}

function decision(universe: NormalizedUniverse, input: Omit<AiDecision, "id" | "createdAt">, index: number): AiDecision {
  const id = `ai-market-${input.season}-${index}-${input.actorId}-${input.kind}`;
  const createdAt = timestamp(input.season, index);
  const item: AiDecision = { ...input, id, createdAt };
  universe.aiDecisions.push(item);
  return item;
}

function contractForSeat(team: NormalizedTeam, driverId: string, targetSeason: number, universe: NormalizedUniverse): Contract | undefined {
  return currentContract(universe, driverId, team.id) ?? universe.season.contracts.find((contract) =>
    contract.driverId === driverId && contract.teamId === team.id && contract.endSeason >= targetSeason,
  );
}

function candidateUtility(universe: NormalizedUniverse, team: NormalizedTeam, driver: NormalizedDriver, targetSeason: number, seat: 0 | 1, assigned: Set<string>) {
  const review = universe.season.performance?.drivers[driver.id];
  const teammateId = team.driverIds.find((id, index) => index !== seat && !assigned.has(id));
  const teammate = teammateId ? universe.season.drivers.find((candidate) => candidate.id === teammateId) : undefined;
  const actual = driverPerformance(universe, driver);
  const expected = calculateDriverOverall(driver, universe.worldConfig);
  const teammatePerformance = teammate ? driverPerformance(universe, teammate) : undefined;
  const salary = calculateSalaryExpectation(driver, {
    seasonPerformance: actual,
    currentSalaryCredits: currentContract(universe, driver.id, team.id)?.salaryCredits,
    marketInterest: clamp(team.reputation),
  }, universe.worldConfig).credits;
  const utility = calculateDriverUtility(team, driver, {
    performance: {
      actualPerformance: actual,
      expectedPerformance: expected,
      teammatePerformance,
      recentForm: review?.rollingForm ?? driver.form,
      previousSeasonPerformance: review?.averageWeekendScore,
      careerPerformance: driver.reputation,
    },
    salaryDemandCredits: salary,
    availableDriverBudgetCredits: team.driverBudgetCredits,
    yearsWithTeam: universe.season.year - (currentContract(universe, driver.id, team.id)?.startSeason ?? targetSeason),
    teamFit: teammate ? (driver.personality.teamwork + teammate.personality.teamwork) / 2 : undefined,
    seed: universe.baseSeed + targetSeason + seat,
  }, universe.worldConfig);
  const teamRank = [...universe.season.teamStandings].sort((a, b) => b.points - a.points || b.wins - a.wins || a.teamId.localeCompare(b.teamId)).findIndex((standing) => standing.teamId === team.id) + 1;
  const competitiveness = clamp(100 - Math.max(0, teamRank - 1) * 7);
  const offer = calculateOfferUtility(driver, team, {
    salaryCredits: Math.max(universe.worldConfig.market.salaryFloorCredits, Math.min(team.driverBudgetCredits, Math.round(salary))),
    contractYears: driver.careerPhase === "decline" ? 1 : driver.careerPhase === "prime" ? 2 : 3,
    role: seat === 0 ? "lead" : "equal",
  }, {
    teamCompetitiveness: competitiveness,
    championshipProbability: clamp(competitiveness * 0.82 + team.prestige * 0.18),
    projectedDevelopment: team.developmentQuality,
    yearsWithTeam: Math.max(0, universe.season.year - (currentContract(universe, driver.id, team.id)?.startSeason ?? targetSeason)),
    currentTeamId: currentContract(universe, driver.id, team.id)?.teamId,
    currentSalaryCredits: currentContract(universe, driver.id, team.id)?.salaryCredits,
    marketInterest: team.reputation,
    seed: universe.baseSeed + targetSeason,
  }, universe.worldConfig);
  return { utility, offer, salary, expected, actual };
}

function setContractStatus(universe: NormalizedUniverse, targetSeason: number, assignments: Map<string, string>): void {
  for (const contract of universe.season.contracts) {
    if (contract.endSeason < targetSeason && (contract.status === "active" || contract.status === "agreed")) {
      contract.status = "expired";
      contract.terminationReason = "Contract term completed; autonomous market review";
    }
    const assignedTeam = assignments.get(contract.driverId);
    if (assignedTeam && assignedTeam !== contract.teamId && (contract.status === "active" || contract.status === "agreed")) {
      contract.status = "terminated";
      contract.terminationReason = "Driver accepted a different team";
    }
  }
}

function addContract(universe: NormalizedUniverse, driver: NormalizedDriver, team: NormalizedTeam, targetSeason: number, seat: number, salary: number, origin: Contract["origin"]): Contract {
  const years = driver.careerPhase === "decline" ? 1 : driver.careerPhase === "prime" ? 2 : 3;
  const contract: Contract = {
    id: `contract-${targetSeason}-${team.id}-${driver.id}`,
    driverId: driver.id,
    teamId: team.id,
    salaryCredits: Math.max(universe.worldConfig.market.salaryFloorCredits, Math.round(salary)),
    startSeason: targetSeason,
    endSeason: targetSeason + Math.max(universe.worldConfig.market.minimumContractYears, Math.min(universe.worldConfig.market.maximumContractYears, years)) - 1,
    role: seat === 0 ? "lead" : "equal",
    optionYears: driver.careerPhase === "decline" ? 0 : 1,
    performanceExitPosition: 14,
    teamExitPosition: 10,
    buyoutCredits: Math.round(Math.max(0, salary) * 0.65),
    status: "active",
    effectiveSeason: targetSeason,
    origin,
    decidedAt: timestamp(targetSeason, universe.season.contracts.length),
  };
  universe.season.contracts.push(contract);
  return contract;
}

/**
 * Resolve expiring seats as an autonomous two-sided market. Incumbents are
 * evaluated over their full available performance review, teams make a
 * scored offer, and drivers can reject it in favour of another team. The
 * final fallback still fills every team to exactly two active cars.
 */
export function resolveAutonomousContractMarket(input: Universe, targetSeason = input.season.year + 1): { universe: NormalizedUniverse; summary: MarketResolutionSummary } {
  const universe = normalizeUniverse(input);
  const assigned = new Set<string>();
  const assignments = new Map<string, string>();
  const summary: MarketResolutionSummary = { targetSeason, renewed: [], signed: [], released: [], declined: [] };
  let decisionIndex = 0;
  const teamOrder = [...universe.season.teams].sort((a, b) => {
    const ap = universe.season.teamStandings.find((standing) => standing.teamId === a.id)?.points ?? 0;
    const bp = universe.season.teamStandings.find((standing) => standing.teamId === b.id)?.points ?? 0;
    return bp - ap || b.prestige - a.prestige || a.id.localeCompare(b.id);
  });
  const seats = new Map<string, Array<string | undefined>>();
  const vacancies: Array<{ team: NormalizedTeam; seat: 0 | 1 }> = [];

  for (const team of teamOrder) {
    const slots: Array<string | undefined> = [undefined, undefined];
    for (let seat = 0; seat < 2; seat += 1) {
      const driver = universe.season.drivers.find((candidate) => candidate.id === team.driverIds[seat]);
      const contract = driver ? contractForSeat(team, driver.id, targetSeason, universe) : undefined;
      const locked = Boolean(driver && driver.status !== "retired" && contract && contract.endSeason >= targetSeason && (contract.status === "active" || contract.status === "agreed"));
      if (locked && driver) {
        slots[seat] = driver.id;
        assigned.add(driver.id);
        assignments.set(driver.id, team.id);
        continue;
      }
      if (driver && driver.status !== "retired") {
        const incumbentScore = candidateUtility(universe, team, driver, targetSeason, seat as 0 | 1, assigned);
        const alternatives = universe.season.drivers
          .filter((candidate) => candidate.id !== driver.id && candidate.status !== "retired" && !assigned.has(candidate.id))
          .map((candidate) => candidateUtility(universe, team, candidate, targetSeason, seat as 0 | 1, assigned));
        const bestAlternative = alternatives.sort((a, b) => b.utility.totalScore - a.utility.totalScore)[0];
        const confidence = team.driverConfidence?.[driver.id] ?? incumbentScore.actual;
        const renewal = evaluateRenewalDecision(driver, {
          incumbentUtility: incumbentScore.utility.totalScore,
          bestAlternativeUtility: bestAlternative?.utility.totalScore,
          teamConfidence: confidence,
          contractYearsRemaining: 0,
          seasonProgress: 1,
          yearsWithTeam: contract ? Math.max(0, universe.season.year - contract.startSeason) : 0,
        });
        decision(universe, {
          season: targetSeason,
          kind: renewal.decision === "RENEW" ? "renew" : renewal.decision === "REPLACE" ? "replace" : "wait",
          actorType: "team",
          actorId: team.id,
          targetIds: [driver.id, ...(bestAlternative ? [universe.season.drivers.find((candidate) => candidate.id !== driver.id && candidate.status !== "retired" && !assigned.has(candidate.id))?.id ?? ""] : [])].filter(Boolean),
          outcome: renewal.decision,
          reasons: renewal.reasons,
          utility: renewal.score,
        }, decisionIndex++);
        if (renewal.decision === "RENEW") {
          const salary = calculateSalaryExpectation(driver, { seasonPerformance: incumbentScore.actual, currentSalaryCredits: contract?.salaryCredits, marketInterest: team.reputation }, universe.worldConfig).credits;
          slots[seat] = driver.id;
          assigned.add(driver.id);
          assignments.set(driver.id, team.id);
          addContract(universe, driver, team, targetSeason, seat, Math.min(team.driverBudgetCredits, salary), "renewal");
          summary.renewed.push(driver.id);
          universe.managementEvents.push({ id: `management-renewal-${targetSeason}-${team.id}-${driver.id}`, season: targetSeason, type: "contract", summary: `${team.name} renewed ${driver.givenName} ${driver.familyName} after its full-term performance review.`, driverIds: [driver.id], teamIds: [team.id], decisionId: universe.aiDecisions.at(-1)?.id, createdAt: timestamp(targetSeason, decisionIndex) });
          continue;
        }
        if (renewal.decision === "WAIT") {
          // WAIT is only meaningful while a contract is still active. At the
          // market boundary this seat is open, so the incumbent joins the pool.
          summary.released.push(driver.id);
        } else summary.released.push(driver.id);
        if (driver.personality.ambition > 55 && bestAlternative && bestAlternative.utility.totalScore > incumbentScore.utility.totalScore) summary.declined.push(driver.id);
      }
      vacancies.push({ team, seat: seat as 0 | 1 });
    }
    seats.set(team.id, slots);
  }

  const candidates = () => universe.season.drivers
    .filter((driver) => driver.status !== "retired" && !assigned.has(driver.id))
    .sort((a, b) => calculateDriverOverall(b, universe.worldConfig) - calculateDriverOverall(a, universe.worldConfig) || a.id.localeCompare(b.id));
  for (const vacancy of vacancies) {
    const slots = seats.get(vacancy.team.id)!;
    const available = candidates();
    if (!available.length) throw new Error(`${vacancy.team.name} could not fill its autonomous market seat.`);
    const offers = available.map((driver) => ({ driver, ...candidateUtility(universe, vacancy.team, driver, targetSeason, vacancy.seat, assigned) }))
      .sort((a, b) => b.offer.totalScore - a.offer.totalScore || b.utility.totalScore - a.utility.totalScore || a.driver.id.localeCompare(b.driver.id));
    const chosen = offers.find((offer) => offer.offer.totalScore >= 35) ?? offers[0]!;
    slots[vacancy.seat] = chosen.driver.id;
    assigned.add(chosen.driver.id);
    assignments.set(chosen.driver.id, vacancy.team.id);
    const accepted = decision(universe, {
      season: targetSeason,
      kind: "accept",
      actorType: "driver",
      actorId: chosen.driver.id,
      targetIds: [vacancy.team.id],
      outcome: `Signed with ${vacancy.team.name}`,
      reasons: chosen.offer.totalScore >= 35 ? ["Offer cleared the driver's utility threshold."] : ["Final fallback filled a legal two-car grid."],
      utility: chosen.offer,
    }, decisionIndex++);
    addContract(universe, chosen.driver, vacancy.team, targetSeason, vacancy.seat, chosen.salary, "market");
    summary.signed.push(chosen.driver.id);
    universe.managementEvents.push({ id: `management-signing-${targetSeason}-${vacancy.team.id}-${chosen.driver.id}`, season: targetSeason, type: "contract", summary: `${chosen.driver.givenName} ${chosen.driver.familyName} signed for ${vacancy.team.name} after a competitive market review.`, driverIds: [chosen.driver.id], teamIds: [vacancy.team.id], decisionId: accepted.id, createdAt: timestamp(targetSeason, decisionIndex) });
  }

  setContractStatus(universe, targetSeason, assignments);
  for (const team of universe.season.teams) {
    const slots = seats.get(team.id)!;
    if (!slots[0] || !slots[1]) throw new Error(`${team.name} did not receive two active drivers.`);
    team.driverIds = [slots[0], slots[1]];
  }
  for (const driver of universe.season.drivers) driver.status = assigned.has(driver.id) ? "f1" : driver.status === "f1" ? "free-agent" : driver.status;
  universe.audit.push({ id: `audit-market-${targetSeason}`, action: "autonomous-contract-market", summary: `Autonomous market renewed ${summary.renewed.length}, signed ${summary.signed.length}, released ${summary.released.length}, and recorded ${summary.declined.length} driver refusals for ${targetSeason}.`, at: timestamp(targetSeason, decisionIndex) });
  return { universe, summary };
}

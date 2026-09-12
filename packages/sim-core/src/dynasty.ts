import { DeterministicRng, hashSeed } from "./rng";
import { generateRookies, progressDriverForNextSeason } from "./progression";
import type { Contract, OffseasonProposal, TeamPerformanceField, TeamRatings, Universe } from "./types";

function uid(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

/** Move the race director through the three user-facing season phases. */
export function advanceSeasonPhase(input: Universe): Universe {
  if (input.season.phase === "preseason") {
    const universe = structuredClone(input);
    universe.season.phase = "between-weekends";
    universe.audit.push({ id: uid("audit"), action: "enter-season", summary: `Entered the ${universe.season.year} season.`, at: new Date().toISOString() });
    universe.updatedAt = new Date().toISOString();
    return universe;
  }
  if (input.season.phase === "season-complete") {
    if (input.mode !== "dynasty") throw new Error("Standalone seasons do not have a next-season offseason package.");
    return proposeOffseason(input);
  }
  if (input.season.phase === "offseason") return approveOffseason(input);
  throw new Error("Advance the phase from preseason, season complete, or an editable offseason package.");
}

/** Change one generated offseason development delta before it is accepted. */
export function editOffseasonRating(input: Universe, teamId: string, field: keyof TeamRatings, delta: number): Universe {
  const universe = structuredClone(input);
  const proposal = universe.season.offseasonProposal;
  if (universe.season.phase !== "offseason" || !proposal || proposal.status !== "pending") {
    throw new Error("Only a pending offseason package can be customized.");
  }
  if (!Number.isFinite(delta)) throw new Error("The offseason change must be a number.");
  const change = proposal.ratingChanges.find((candidate) => candidate.teamId === teamId && candidate.field === field);
  if (!change) throw new Error("That team has no proposed change for this field.");
  change.delta = Math.max(-12, Math.min(12, Math.round(delta)));
  universe.audit.push({ id: uid("audit"), action: "edit-offseason-package", summary: `${teamId}: ${field} offseason change set to ${change.delta}.`, at: new Date().toISOString() });
  universe.updatedAt = new Date().toISOString();
  return universe;
}

const teamPerformanceFields: TeamPerformanceField[] = ["power", "aerodynamics", "mechanicalGrip", "tirePreservation", "reliability", "pitCrew", "strategy"];

function clampRating(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Rebase every constructor around its prior finishing position for a
 * contestable new season.  A regulation reset deliberately compresses the
 * field into a narrow performance band: the champion gives back some of its
 * advantage while lower teams receive a catch-up target.  Development
 * potential remains persistent, but it is also pulled toward an era baseline
 * so a single run of perfect upgrades cannot make a team unbeatable forever.
 */
export function resetTeamRatingsForNextSeason(input: Universe, targetSeason = input.season.year + 1): Universe {
  const universe = structuredClone(input);
  const order = [...universe.season.teamStandings].sort((a, b) => b.points - a.points || b.wins - a.wins);
  const rank = new Map(order.map((standing, index) => [standing.teamId, index]));
  const denominator = Math.max(1, universe.season.teams.length - 1);
  const rng = new DeterministicRng(hashSeed(universe.baseSeed, targetSeason, "team-rating-reset"));
  universe.season.teams.forEach((team) => {
    const index = rank.get(team.id) ?? universe.season.teams.length - 1;
    const catchUp = (universe.season.teams.length - 1 - index) / denominator;
    // The worst team starts only a few points above the champion.  The small
    // inverted rank bias creates a genuine route to the title without making
    // the previous order irrelevant, while the seeded swing allows either end
    // of the grid to over- or under-perform in a particular season.
    const formTarget = 82 + (0.5 - catchUp) * 7;
    for (const field of teamPerformanceFields) {
      // Compress the previous rating before blending.  A 100-rated car and a
      // 20-rated car should both enter the new regulation cycle near the
      // competitive band, while the prior order still contributes a little
      // momentum.
      const compressedPrior = 72 + (team.ratings[field] - 72) * 0.2;
      team.ratings[field] = clampRating(compressedPrior * 0.18 + formTarget * 0.82 + rng.between(-3.5, 3.5));
    }
    const potentialTarget = 70 + catchUp * 10;
    team.ratings.developmentPotential = clampRating(team.ratings.developmentPotential * 0.55 + (potentialTarget + rng.between(-3, 3)) * 0.45);
  });
  return universe;
}

function resolveNextSeasonContracts(universe: Universe, targetSeason: number): { retained: number; signed: number; released: number } {
  const prior = new Map(universe.season.driverStandings.map((standing) => [standing.driverId, standing]));
  const ordered = [...universe.season.driverStandings].sort((a, b) => b.points - a.points || b.wins - a.wins);
  const cutoff = ordered[Math.max(0, Math.floor(ordered.length * 0.6))]?.points ?? 0;
  const assignments = new Map<string, string>();
  const retained = new Set<string>();
  let released = 0;
  for (const team of universe.season.teams) {
    for (const driverId of team.driverIds) {
      const contract = universe.season.contracts.find((candidate) => candidate.driverId === driverId && candidate.teamId === team.id && candidate.status !== "terminated" && candidate.endSeason >= targetSeason);
      const standing = prior.get(driverId);
      const keep = Boolean(contract) || Boolean(standing && standing.points >= cutoff);
      if (keep && !retained.has(driverId)) {
        retained.add(driverId);
        assignments.set(driverId, team.id);
      } else if (!keep) {
        released += 1;
      }
    }
  }

  const candidates = universe.season.drivers.filter((driver) => !retained.has(driver.id)).sort((a, b) => {
    const aStanding = prior.get(a.id); const bStanding = prior.get(b.id);
    const aScore = (aStanding?.points ?? 0) + a.potential * 0.2 + a.ratings.racePace * 0.1;
    const bScore = (bStanding?.points ?? 0) + b.potential * 0.2 + b.ratings.racePace * 0.1;
    return bScore - aScore || a.id.localeCompare(b.id);
  });
  let signed = 0;
  for (const team of universe.season.teams) {
    const slots = team.driverIds.map((driverId) => retained.has(driverId) ? driverId : undefined) as [string | undefined, string | undefined];
    for (let seat = 0; seat < slots.length; seat += 1) {
      if (!slots[seat]) {
        const next = candidates.shift();
        if (next) {
          slots[seat] = next.id;
          retained.add(next.id);
          assignments.set(next.id, team.id);
          signed += 1;
        }
      }
    }
    if (!slots[0] || !slots[1]) throw new Error(`${team.name} could not fill both active seats for ${targetSeason}.`);
    team.driverIds = [slots[0], slots[1]];
  }

  for (const contract of universe.season.contracts) {
    if (contract.endSeason < targetSeason) contract.status = "expired";
    const assignedTeam = assignments.get(contract.driverId);
    if (assignedTeam && assignedTeam !== contract.teamId && contract.status === "active") contract.status = "terminated";
    if (!assignedTeam && contract.status === "active") contract.status = "terminated";
  }
  for (const team of universe.season.teams) {
    team.driverIds.forEach((driverId, seat) => {
      const existing = universe.season.contracts.find((contract) => contract.driverId === driverId && contract.teamId === team.id && contract.status === "active" && contract.endSeason >= targetSeason);
      if (existing) return;
      const driver = universe.season.drivers.find((candidate) => candidate.id === driverId)!;
      universe.season.contracts.push({
        id: uid("contract"), driverId, teamId: team.id, salaryCredits: Math.round(((driver.ratings.racePace + driver.ratings.qualifyingPace) / 2) ** 2),
        startSeason: targetSeason, endSeason: targetSeason + (seat === 0 ? 2 : 1), role: seat === 0 ? "lead" : "equal", optionYears: 1,
        performanceExitPosition: 12, teamExitPosition: 10, buyoutCredits: Math.round(driver.ratings.racePace * 260), status: "active",
      });
    });
  }
  return { retained: assignments.size - signed, signed, released };
}

export function proposeOffseason(input: Universe): Universe {
  const universe = structuredClone(input);
  if (universe.mode !== "dynasty" || universe.season.phase !== "season-complete") {
    throw new Error("Offseason proposals require a completed dynasty season.");
  }
  const rng = new DeterministicRng(hashSeed(universe.baseSeed, universe.season.year, "offseason"));
  const sortedTeams = [...universe.season.teamStandings].sort((a, b) => a.points - b.points);
  const driverMoves: OffseasonProposal["driverMoves"] = [];
  if (sortedTeams.length >= 2 && rng.chance(0.7)) {
    const first = universe.season.teams.find((team) => team.id === sortedTeams[0]!.teamId)!;
    const second = universe.season.teams.find((team) => team.id === sortedTeams[1]!.teamId)!;
    driverMoves.push({ driverId: first.driverIds[1], fromTeamId: first.id, toTeamId: second.id });
  }
  const fields: Array<keyof TeamRatings> = ["power", "aerodynamics", "mechanicalGrip", "tirePreservation", "reliability", "pitCrew", "strategy"];
  const ratingChanges = universe.season.teams.map((team) => {
    const rawDelta = Math.round(rng.between(-2, 4) * universe.randomness.developmentVariance * (team.ratings.developmentPotential / 80));
    return {
      teamId: team.id,
      field: rng.pick(fields),
      // Every constructor gets a meaningful offseason direction; the size is
      // still small enough for the championship to remain contestable.
      delta: rawDelta || (rng.chance(team.ratings.developmentPotential / 100) ? 1 : -1),
    };
  });
  const rookies = generateRookies(universe, universe.season.year + 1, rng);
  const proposal: OffseasonProposal = {
    id: uid("offseason"),
    targetSeason: universe.season.year + 1,
    status: "pending",
    summary: `${driverMoves.length} proposed driver move${driverMoves.length === 1 ? "" : "s"}, ${ratingChanges.filter((item) => item.delta !== 0).length} development changes, and ${rookies.length} new rookie${rookies.length === 1 ? "" : "s"} for the free-agent pool.`,
    driverMoves,
    ratingChanges,
    calendarChanges: ["Carry forward the current calendar; race director may edit before approval."],
    ruleChanges: rng.chance(0.25) ? ["Proposal: adjust sprint allocation for the next season."] : ["Carry forward the current major-era rules."],
    rookies,
  };
  universe.season.offseasonProposal = proposal;
  universe.season.phase = "offseason";
  universe.audit.push({ id: uid("audit"), action: "propose-offseason", summary: proposal.summary, at: new Date().toISOString() });
  return universe;
}

export function approveOffseason(input: Universe): Universe {
  let universe = structuredClone(input);
  const proposal = universe.season.offseasonProposal;
  if (!proposal || proposal.status !== "pending") throw new Error("There is no pending offseason package.");

  const priorHistory = universe.seasonHistory ?? [];
  universe.seasonHistory = [...priorHistory, {
    year: universe.season.year,
    drivers: structuredClone(universe.season.drivers),
    teams: structuredClone(universe.season.teams),
    completedWeekends: structuredClone(universe.season.completedWeekends),
    driverStandings: structuredClone(universe.season.driverStandings),
    teamStandings: structuredClone(universe.season.teamStandings),
  }];

  universe = resetTeamRatingsForNextSeason(universe, proposal.targetSeason);
  for (const change of proposal.ratingChanges) {
    const team = universe.season.teams.find((candidate) => candidate.id === change.teamId);
    if (team) team.ratings[change.field] = Math.max(0, Math.min(100, team.ratings[change.field] + change.delta));
  }
  for (const move of proposal.driverMoves) {
    const destination = universe.season.teams.find((team) => team.id === move.toTeamId);
    const source = universe.season.teams.find((team) => team.id === move.fromTeamId);
    if (!destination) continue;
    const displaced = destination.driverIds[1];
    destination.driverIds[1] = move.driverId;
    if (source) source.driverIds[source.driverIds.indexOf(move.driverId) as 0 | 1] = displaced;
  }

  universe.season.year = proposal.targetSeason;
  universe.season.ruleset.year = proposal.targetSeason;
  universe.season.ruleset.id = `rules-${proposal.targetSeason}-${universe.id}`;
  universe.season.weekends.forEach((weekend) => { weekend.id = `${proposal.targetSeason}-round-${weekend.round}`; });
  universe.season.drivers = universe.season.drivers.map((driver) => progressDriverForNextSeason(
    driver,
    new DeterministicRng(hashSeed(universe.baseSeed, proposal.targetSeason, "driver-progression", driver.id)),
    universe.randomness.developmentVariance,
  ));
  const incomingRookies = proposal.rookies ?? generateRookies(universe, proposal.targetSeason);
  const existingDriverIds = new Set(universe.season.drivers.map((driver) => driver.id));
  universe.season.drivers.push(...incomingRookies.filter((driver) => !existingDriverIds.has(driver.id)));
  const market = resolveNextSeasonContracts(universe, proposal.targetSeason);
  proposal.status = "approved";
  universe.season.currentRoundIndex = 0;
  universe.season.currentWeekend = undefined;
  universe.season.completedWeekends = [];
  universe.season.driverStandings = universe.season.drivers.map((driver) => ({ driverId: driver.id, points: 0, wins: 0, podiums: 0, poles: 0, finishes: {} }));
  universe.season.teamStandings = universe.season.teams.map((team) => ({ teamId: team.id, points: 0, wins: 0 }));
  universe.season.teamUpgrades = [];
  universe.season.rulesLocked = false;
  universe.season.offseasonProposal = undefined;
  universe.season.phase = "preseason";
  universe.audit.push({ id: uid("audit"), action: "approve-offseason", summary: `Approved offseason package for ${proposal.targetSeason}; retained ${market.retained}, signed ${market.signed}, and released ${market.released} driver${market.released === 1 ? "" : "s"}. Team ratings were rebased around the prior championship order.`, at: new Date().toISOString() });
  universe.updatedAt = new Date().toISOString();
  return universe;
}

export function signContract(input: Universe, contract: Omit<Contract, "id" | "status">): Universe {
  const universe = structuredClone(input);
  if (universe.season.phase === "session") throw new Error("A contract cannot take effect during an active session.");
  const signed: Contract = { ...contract, id: uid("contract"), status: "agreed" };
  if (signed.endSeason < signed.startSeason) throw new Error("Contract end season cannot precede its start.");
  if (signed.salaryCredits < 0 || signed.buyoutCredits < 0) throw new Error("Contract values cannot be negative.");
  universe.season.contracts.push(signed);
  universe.audit.push({ id: uid("audit"), action: "sign-contract", summary: `Contract agreed for ${signed.driverId} with ${signed.teamId}.`, at: new Date().toISOString() });
  return universe;
}

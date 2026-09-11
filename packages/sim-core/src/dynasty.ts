import { DeterministicRng, hashSeed } from "./rng";
import { generateRookies, progressDriverForNextSeason } from "./progression";
import type { Contract, OffseasonProposal, TeamRatings, Universe } from "./types";

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
  const universe = structuredClone(input);
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
  universe.season.contracts.forEach((contract) => {
    if (contract.endSeason < proposal.targetSeason) contract.status = "expired";
  });
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
  universe.audit.push({ id: uid("audit"), action: "approve-offseason", summary: `Approved offseason package for ${proposal.targetSeason}.`, at: new Date().toISOString() });
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

import { calculateDriverOverall, calculateSalaryExpectation } from "./team-ai";
import { normalizeUniverse } from "./migrations";
import type { Contract, NormalizedUniverse, Universe } from "./types";

export type WorldIssueCode =
  | "INVALID_TEAM_SEATS"
  | "UNKNOWN_DRIVER"
  | "DUPLICATE_ACTIVE_DRIVER"
  | "RETIRED_DRIVER_SEATED"
  | "DRIVER_STATUS_MISMATCH"
  | "MISSING_ACTIVE_CONTRACT"
  | "DUPLICATE_ACTIVE_CONTRACT"
  | "INVALID_CONTRACT"
  | "INVALID_RATING"
  | "INVALID_BUDGET"
  | "INVALID_JUNIOR_REFERENCE";

export interface WorldValidationIssue {
  code: WorldIssueCode;
  message: string;
  driverId?: string;
  teamId?: string;
}

const ratingInRange = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

export function validateUniverseState(input: Universe): WorldValidationIssue[] {
  const universe = normalizeUniverse(input);
  const issues: WorldValidationIssue[] = [];
  const driverIds = new Set(universe.season.drivers.map((driver) => driver.id));
  const teamIds = new Set(universe.season.teams.map((team) => team.id));
  const seated = new Map<string, string>();

  for (const driver of universe.season.drivers) {
    if (driver.age < 0 || !Object.values(driver.ratings).every(ratingInRange) || !Object.values(driver.advancedRatings).every(ratingInRange)) {
      issues.push({ code: "INVALID_RATING", driverId: driver.id, message: `${driver.code} has an invalid age or rating.` });
    }
  }

  for (const team of universe.season.teams) {
    if (!Array.isArray(team.driverIds) || team.driverIds.length !== 2) {
      issues.push({ code: "INVALID_TEAM_SEATS", teamId: team.id, message: `${team.name} must have exactly two active seats.` });
    }
    if (team.budgetCredits < 0 || team.driverBudgetCredits < 0 || team.driverBudgetCredits > team.budgetCredits) {
      issues.push({ code: "INVALID_BUDGET", teamId: team.id, message: `${team.name} has an invalid budget.` });
    }
    for (const driverId of team.driverIds) {
      const driver = universe.season.drivers.find((candidate) => candidate.id === driverId);
      if (!driverIds.has(driverId) || !driver) {
        issues.push({ code: "UNKNOWN_DRIVER", teamId: team.id, driverId, message: `${team.name} references unknown driver ${driverId}.` });
        continue;
      }
      const otherTeam = seated.get(driverId);
      if (otherTeam) issues.push({ code: "DUPLICATE_ACTIVE_DRIVER", driverId, teamId: team.id, message: `${driver.code} occupies seats at ${otherTeam} and ${team.id}.` });
      else seated.set(driverId, team.id);
      if (driver.status === "retired") issues.push({ code: "RETIRED_DRIVER_SEATED", driverId, teamId: team.id, message: `${driver.code} is retired but occupies an F1 seat.` });
      if (driver.status !== "f1") issues.push({ code: "DRIVER_STATUS_MISMATCH", driverId, teamId: team.id, message: `${driver.code} is seated but has status ${driver.status}.` });

      const matching = universe.season.contracts.filter((contract) =>
        contract.driverId === driverId && contract.teamId === team.id &&
        (contract.status === "active" || contract.status === "agreed") &&
        contract.startSeason <= universe.season.year && contract.endSeason >= universe.season.year,
      );
      if (matching.length === 0) issues.push({ code: "MISSING_ACTIVE_CONTRACT", driverId, teamId: team.id, message: `${driver.code} has no current contract with ${team.name}.` });
    }
  }

  const contractsByDriver = new Map<string, Contract[]>();
  for (const contract of universe.season.contracts) {
    if (!driverIds.has(contract.driverId) || !teamIds.has(contract.teamId) || contract.endSeason < contract.startSeason || contract.salaryCredits < 0 || contract.buyoutCredits < 0) {
      issues.push({ code: "INVALID_CONTRACT", driverId: contract.driverId, teamId: contract.teamId, message: `Contract ${contract.id} is invalid.` });
    }
    if ((contract.status === "active" || contract.status === "agreed") && contract.endSeason >= universe.season.year) {
      const entries = contractsByDriver.get(contract.driverId) ?? [];
      entries.push(contract);
      contractsByDriver.set(contract.driverId, entries);
    }
  }
  for (const [driverId, contracts] of contractsByDriver) {
    const teamCount = new Set(contracts.map((contract) => contract.teamId)).size;
    if (teamCount > 1) issues.push({ code: "DUPLICATE_ACTIVE_CONTRACT", driverId, message: `${driverId} has active F1 contracts with multiple teams.` });
  }

  for (const driver of universe.season.drivers) {
    if (driver.status === "f1" && !seated.has(driver.id)) {
      issues.push({ code: "DRIVER_STATUS_MISMATCH", driverId: driver.id, message: `${driver.code} has F1 status without a race seat.` });
    }
  }
  const juniorIds = [
    ...universe.juniorState.f2DriverIds,
    ...universe.juniorState.f3DriverIds,
    ...universe.juniorState.reserveDriverIds,
    ...Object.values(universe.juniorState.academyDriverIdsByTeam).flat(),
  ];
  for (const driverId of juniorIds) {
    if (!driverIds.has(driverId)) issues.push({ code: "INVALID_JUNIOR_REFERENCE", driverId, message: `Junior registry references unknown driver ${driverId}.` });
  }
  return issues;
}

function recoveryTimestamp(season: number, index: number): string {
  return new Date(Date.UTC(season, 0, 3, 0, index)).toISOString();
}

/**
 * Repair recoverable roster drift deterministically. It never invents a
 * driver: callers must generate an emergency prospect first if the registry
 * cannot supply enough eligible people.
 */
export function repairUniverseRosters(input: Universe): NormalizedUniverse {
  const universe = normalizeUniverse(input);
  const assigned = new Set<string>();
  const eligible = () => universe.season.drivers
    .filter((driver) => driver.status !== "retired" && !assigned.has(driver.id))
    .sort((a, b) => calculateDriverOverall(b, universe.worldConfig) - calculateDriverOverall(a, universe.worldConfig) || a.id.localeCompare(b.id));

  universe.season.teams.forEach((team, teamIndex) => {
    const repaired: string[] = [];
    for (const candidateId of team.driverIds ?? []) {
      const driver = universe.season.drivers.find((candidate) => candidate.id === candidateId);
      if (repaired.length < 2 && driver && driver.status !== "retired" && !assigned.has(driver.id)) {
        repaired.push(driver.id);
        assigned.add(driver.id);
      }
    }
    while (repaired.length < 2) {
      const replacement = eligible()[0];
      if (!replacement) throw new Error(`${team.name} cannot recover its grid because fewer than two eligible drivers remain.`);
      repaired.push(replacement.id);
      assigned.add(replacement.id);
      universe.managementEvents.push({
        id: `management-recovery-${universe.season.year}-${team.id}-${repaired.length}`,
        season: universe.season.year,
        type: "recovery",
        summary: `${replacement.givenName} ${replacement.familyName} received an emergency ${team.name} seat during roster recovery.`,
        driverIds: [replacement.id],
        teamIds: [team.id],
        createdAt: recoveryTimestamp(universe.season.year, teamIndex * 2 + repaired.length),
      });
    }
    team.driverIds = [repaired[0]!, repaired[1]!];
  });

  for (const driver of universe.season.drivers) {
    if (assigned.has(driver.id)) driver.status = "f1";
    else if (driver.status === "f1") driver.status = "free-agent";
  }

  const seatedTeam = new Map(universe.season.teams.flatMap((team) => team.driverIds.map((driverId) => [driverId, team.id] as const)));
  for (const contract of universe.season.contracts) {
    if ((contract.status === "active" || contract.status === "agreed") && contract.endSeason >= universe.season.year) {
      if (seatedTeam.get(contract.driverId) !== contract.teamId) {
        contract.status = "terminated";
        contract.terminationReason = "Roster consistency recovery";
      }
    }
  }
  universe.season.teams.forEach((team) => team.driverIds.forEach((driverId, seat) => {
    const current = universe.season.contracts.find((contract) =>
      contract.driverId === driverId && contract.teamId === team.id && contract.status === "active" && contract.endSeason >= universe.season.year,
    );
    if (current) return;
    const driver = universe.season.drivers.find((candidate) => candidate.id === driverId)!;
    const salary = Math.min(team.driverBudgetCredits, calculateSalaryExpectation(driver, {}, universe.worldConfig).credits);
    universe.season.contracts.push({
      id: `contract-recovery-${universe.season.year}-${team.id}-${seat}`,
      driverId,
      teamId: team.id,
      salaryCredits: salary,
      startSeason: universe.season.year,
      endSeason: universe.season.year,
      role: seat === 0 ? "lead" : "equal",
      optionYears: 0,
      buyoutCredits: salary,
      status: "active",
      effectiveSeason: universe.season.year,
      origin: "migration",
      decidedAt: recoveryTimestamp(universe.season.year, seat),
    });
  }));
  return universe;
}

import type { Driver, DriverRatings, NarrativeVersion, Team, TeamRatings, Universe } from "./types";

export type DriverWorkshopValues = Partial<DriverRatings> & { potential?: number };

export interface WorkshopEdits {
  drivers: Record<string, DriverWorkshopValues>;
  teams: Record<string, Partial<TeamRatings>>;
}

function uid(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function boundaryOnly(universe: Universe, action: string): void {
  if (!['preseason', 'between-weekends', 'offseason'].includes(universe.season.phase)) {
    throw new Error(`${action} is only available outside an active session.`);
  }
}

export function updateDriverRating(input: Universe, driverId: string, field: keyof DriverRatings, value: number): Universe {
  const universe = structuredClone(input);
  if (universe.season.rulesLocked) throw new Error("Driver base ratings lock when the season begins; use form or roster controls between weekends.");
  const driver = universe.season.drivers.find((candidate) => candidate.id === driverId);
  if (!driver) throw new Error("Driver not found.");
  driver.ratings[field] = Math.max(0, Math.min(100, Math.round(value)));
  universe.audit.push({ id: uid("audit"), action: "edit-driver-rating", summary: `${driver.familyName}: ${field} set to ${driver.ratings[field]}.`, at: new Date().toISOString() });
  universe.updatedAt = new Date().toISOString();
  return universe;
}

export function updateTeamRating(input: Universe, teamId: string, field: keyof TeamRatings, value: number): Universe {
  const universe = structuredClone(input);
  boundaryOnly(universe, "Team development");
  const team = universe.season.teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error("Team not found.");
  team.ratings[field] = Math.max(0, Math.min(100, Math.round(value)));
  universe.audit.push({ id: uid("audit"), action: "team-development", summary: `${team.name}: ${field} set to ${team.ratings[field]}; effective next weekend.`, at: new Date().toISOString() });
  universe.updatedAt = new Date().toISOString();
  return universe;
}

export function applyWorkshopEdits(input: Universe, edits: WorkshopEdits): Universe {
  const universe = structuredClone(input);
  if (Object.keys(edits.drivers).length > 0 && universe.season.rulesLocked) {
    throw new Error("Driver base ratings lock when the season begins; discard those pending edits or apply them before round one.");
  }
  if (Object.keys(edits.teams).length > 0) boundaryOnly(universe, "Team development");

  let driverChanges = 0;
  let teamChanges = 0;
  for (const [driverId, values] of Object.entries(edits.drivers)) {
    const driver = universe.season.drivers.find((candidate) => candidate.id === driverId);
    if (!driver) throw new Error(`Driver ${driverId} not found.`);
    for (const [field, value] of Object.entries(values) as Array<[keyof DriverWorkshopValues, number]>) {
      if (!Number.isFinite(value)) throw new Error(`${field} must be a number.`);
      if (field === "potential") driver.potential = Math.max(0, Math.min(100, Math.round(value)));
      else driver.ratings[field] = Math.max(0, Math.min(100, Math.round(value)));
      driverChanges += 1;
    }
  }
  for (const [teamId, values] of Object.entries(edits.teams)) {
    const team = universe.season.teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new Error(`Team ${teamId} not found.`);
    for (const [field, value] of Object.entries(values) as Array<[keyof TeamRatings, number]>) {
      if (!Number.isFinite(value)) throw new Error(`${field} must be a number.`);
      team.ratings[field] = Math.max(0, Math.min(100, Math.round(value)));
      teamChanges += 1;
    }
  }

  if (driverChanges === 0 && teamChanges === 0) return universe;
  const now = new Date().toISOString();
  universe.audit.push({
    id: uid("audit"),
    action: "apply-workshop-edits",
    summary: `Applied ${driverChanges} driver and ${teamChanges} team rating change${driverChanges + teamChanges === 1 ? "" : "s"}; team changes take effect next weekend.`,
    at: now,
  });
  universe.updatedAt = now;
  return universe;
}

export function appendNarrative(input: Universe, narrative: Omit<NarrativeVersion, "id" | "createdAt">): Universe {
  const universe = structuredClone(input);
  universe.narratives.push({ ...narrative, id: uid("narrative"), createdAt: new Date().toISOString() });
  universe.updatedAt = new Date().toISOString();
  return universe;
}

export function reviseNarrative(input: Universe, sourceId: string, text: string): Universe {
  const universe = structuredClone(input);
  const source = universe.narratives.find((narrative) => narrative.id === sourceId);
  if (!source) throw new Error("Narrative version not found.");
  universe.narratives.push({ ...source, id: uid("narrative"), text, provider: "manual", model: "manual-edit", createdAt: new Date().toISOString(), replacesId: source.id, status: "complete" });
  universe.updatedAt = new Date().toISOString();
  return universe;
}

export function addCustomTeam(input: Universe, team: Team, drivers: [Driver, Driver]): Universe {
  const universe = structuredClone(input);
  if (!['preseason', 'offseason'].includes(universe.season.phase)) throw new Error("Teams may enter only before a season or during an offseason.");
  const knownIds = new Set(universe.season.drivers.map((driver) => driver.id));
  if (universe.season.teams.some((candidate) => candidate.id === team.id)) throw new Error("That team ID already exists.");
  if (drivers.some((driver) => knownIds.has(driver.id))) throw new Error("A custom driver ID already exists.");
  team.driverIds = [drivers[0].id, drivers[1].id];
  universe.season.drivers.push(...drivers);
  universe.season.teams.push(team);
  universe.season.driverStandings.push(...drivers.map((driver) => ({ driverId: driver.id, points: 0, wins: 0, podiums: 0, poles: 0, finishes: {} })));
  universe.season.teamStandings.push({ teamId: team.id, points: 0, wins: 0 });
  universe.audit.push({ id: uid("audit"), action: "add-team", summary: `${team.name} entered with two active cars.`, at: new Date().toISOString() });
  return universe;
}

export function removeTeam(input: Universe, teamId: string): Universe {
  const universe = structuredClone(input);
  if (!['preseason', 'offseason'].includes(universe.season.phase)) throw new Error("Teams may withdraw only before a season or during an offseason.");
  if (universe.season.teams.length <= 2) throw new Error("A season needs at least two teams.");
  const team = universe.season.teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error("Team not found.");
  universe.season.teams = universe.season.teams.filter((candidate) => candidate.id !== teamId);
  universe.season.teamStandings = universe.season.teamStandings.filter((standing) => standing.teamId !== teamId);
  universe.season.contracts.forEach((contract) => { if (contract.teamId === teamId) contract.status = "terminated"; });
  universe.audit.push({ id: uid("audit"), action: "remove-team", summary: `${team.name} withdrew; its drivers remain free agents.`, at: new Date().toISOString() });
  return universe;
}

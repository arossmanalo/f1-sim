import type { Driver, SeasonPreset, Team } from "./types";

const ratingKeys = [
  "qualifyingPace",
  "racePace",
  "tireManagement",
  "overtaking",
  "defending",
  "braking",
  "cornering",
  "wetWeather",
  "consistency",
  "experience",
] as const;

export function validatePreset(preset: SeasonPreset): string[] {
  const errors: string[] = [];
  const driverIds = new Set(preset.drivers.map((driver) => driver.id));
  const assigned = new Set<string>();

  if (preset.teams.length < 2) errors.push("A season needs at least two teams.");
  if (preset.weekends.length === 0) errors.push("A season needs at least one weekend.");

  for (const driver of preset.drivers) validateDriver(driver, errors);
  for (const team of preset.teams) validateTeam(team, driverIds, assigned, errors);

  const circuitIds = new Set(preset.circuits.map((circuit) => circuit.id));
  for (const weekend of preset.weekends) {
    if (!circuitIds.has(weekend.circuitId)) errors.push(`${weekend.name} references an unknown circuit.`);
  }

  return errors;
}

function validateDriver(driver: Driver, errors: string[]): void {
  for (const key of ratingKeys) {
    const value = driver.ratings[key];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.push(`${driver.givenName} ${driver.familyName}: ${key} must be between 0 and 100.`);
    }
  }
  if (!Number.isFinite(driver.potential) || driver.potential < 0 || driver.potential > 100) {
    errors.push(`${driver.givenName} ${driver.familyName}: potential must be between 0 and 100.`);
  }
  if (!Number.isInteger(driver.number) || driver.number < 0 || driver.number > 999) {
    errors.push(`${driver.givenName} ${driver.familyName}: invalid driver number.`);
  }
}

function validateTeam(team: Team, driverIds: Set<string>, assigned: Set<string>, errors: string[]): void {
  if (team.driverIds.length !== 2) errors.push(`${team.name} must have exactly two active seats.`);
  for (const driverId of team.driverIds) {
    if (!driverIds.has(driverId)) errors.push(`${team.name} references unknown driver ${driverId}.`);
    if (assigned.has(driverId)) errors.push(`Driver ${driverId} occupies more than one active seat.`);
    assigned.add(driverId);
  }
  for (const [key, value] of Object.entries(team.ratings)) {
    if (!Number.isFinite(value) || value < 0 || value > 100) errors.push(`${team.name}: ${key} must be between 0 and 100.`);
  }
}

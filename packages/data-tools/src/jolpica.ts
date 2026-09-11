import { createHash } from "node:crypto";
import type { SourceSnapshot } from "@f1-sim/core";

const API_ROOT = "https://api.jolpi.ca/ergast/f1";

export interface ImmutableSeasonSnapshot extends SourceSnapshot {
  checksum: string;
  endpoints: Record<string, string>;
  payload: Record<string, unknown>;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Jolpica request failed (${response.status}) for ${url}`);
  return response.json();
}

export async function fetchSeasonSnapshot(season: number): Promise<ImmutableSeasonSnapshot> {
  if (!Number.isInteger(season) || season < 1950 || season > new Date().getFullYear() + 1) {
    throw new Error("Season must be an integer from 1950 through the current catalog window.");
  }
  const endpointPaths = {
    races: `${season}.json?limit=100`,
    drivers: `${season}/drivers.json?limit=200`,
    constructors: `${season}/constructors.json?limit=100`,
    results: `${season}/results.json?limit=3000`,
    qualifying: `${season}/qualifying.json?limit=3000`,
    sprints: `${season}/sprint.json?limit=1000`,
    standings: `${season}/driverStandings.json?limit=200`,
  };
  const entries = await Promise.all(Object.entries(endpointPaths).map(async ([key, path]) => {
    const url = `${API_ROOT}/${path}`;
    return [key, url, await getJson(url)] as const;
  }));
  const payload = Object.fromEntries(entries.map(([key, , value]) => [key, value]));
  const endpoints = Object.fromEntries(entries.map(([key, url]) => [key, url]));
  const serialized = JSON.stringify(payload);
  const checksum = createHash("sha256").update(serialized).digest("hex");
  const fetchedAt = new Date().toISOString();
  return {
    id: `jolpica-${season}-${fetchedAt.slice(0, 10)}-${checksum.slice(0, 10)}`,
    provider: "jolpica",
    season,
    fetchedAt,
    schemaVersion: 1,
    immutable: true,
    note: `Immutable factual source snapshot for ${season}; derived ratings remain editable in forked universes.`,
    checksum,
    endpoints,
    payload,
  };
}

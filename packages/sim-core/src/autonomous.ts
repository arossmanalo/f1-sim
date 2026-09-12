import { evolveTeamsForNextSeasonInPlace } from "./team-development";
import { resolveAutonomousContractMarketInPlace } from "./contract-market";
import { advanceJuniorEcosystem, developDriverCareer, evaluateRetirement } from "./career";
import { fastForwardSeason } from "./engine";
import { normalizeUniverse } from "./migrations";
import type { DriverStanding, ManagementEvent, NormalizedDriver, NormalizedUniverse, SeasonArchive, TeamStanding, Universe } from "./types";

function timestamp(season: number, index: number): string {
  return new Date(Date.UTC(season, 0, 20, 0, index)).toISOString();
}

function activeDriverIds(universe: NormalizedUniverse): string[] {
  return universe.season.teams.flatMap((team) => team.driverIds);
}

function standingsOrder<T extends { points: number; wins?: number; driverId?: string; teamId?: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.points - a.points || (b.wins ?? 0) - (a.wins ?? 0) || (a.driverId ?? a.teamId ?? "").localeCompare(b.driverId ?? b.teamId ?? ""));
}

function updateCareerStats(universe: NormalizedUniverse): void {
  const driverStandings = standingsOrder(universe.season.driverStandings);
  const teamStandings = standingsOrder(universe.season.teamStandings);
  const active = new Set(activeDriverIds(universe));
  for (const driver of universe.season.drivers) {
    if (!active.has(driver.id)) continue;
    const standing = driverStandings.find((entry) => entry.driverId === driver.id);
    const stats = driver.careerStats;
    stats.seasons += 1;
    const teamId = universe.season.teams.find((team) => team.driverIds.includes(driver.id))?.id;
    if (teamId && !stats.teamIds.includes(teamId)) stats.teamIds.push(teamId);
    stats.raceStarts += universe.season.completedWeekends.filter((weekend) => !weekend.voided && weekend.race.some((entry) => entry.driverId === driver.id && entry.status !== "dns")).length;
    stats.wins += standing?.wins ?? 0;
    stats.podiums += standing?.podiums ?? 0;
    stats.poles += standing?.poles ?? 0;
    stats.points += standing?.points ?? 0;
    stats.bestChampionshipFinish = Math.min(stats.bestChampionshipFinish ?? Number.POSITIVE_INFINITY, driverStandings.findIndex((entry) => entry.driverId === driver.id) + 1);
    if (driverStandings[0]?.driverId === driver.id) stats.championships += 1;
  }
  for (const team of universe.season.teams) {
    const standing = teamStandings.find((entry) => entry.teamId === team.id);
    const stats = team.careerStats;
    const rank = teamStandings.findIndex((entry) => entry.teamId === team.id) + 1;
    stats.seasonResults.push({ season: universe.season.year, position: rank || universe.season.teams.length, points: standing?.points ?? 0 });
    stats.raceWins += standing?.wins ?? 0;
    stats.podiums += universe.season.completedWeekends.filter((weekend) => !weekend.voided && weekend.race.filter((entry) => entry.teamId === team.id && entry.status === "finished" && entry.position <= 3).length > 0).length;
    if (rank === 1 && universe.season.ruleset.constructorsChampionship) stats.constructorsChampionships += 1;
    if (team.driverIds.some((driverId) => driverStandings[0]?.driverId === driverId)) stats.driverChampionships += 1;
  }
}

function archiveSeason(universe: NormalizedUniverse): SeasonArchive {
  const driverStandings = standingsOrder(universe.season.driverStandings);
  const teamStandings = standingsOrder(universe.season.teamStandings);
  return {
    year: universe.season.year,
    drivers: structuredClone(universe.season.drivers),
    teams: structuredClone(universe.season.teams),
    completedWeekends: structuredClone(universe.season.completedWeekends),
    driverStandings: structuredClone(universe.season.driverStandings),
    teamStandings: structuredClone(universe.season.teamStandings),
    driverChampionId: driverStandings[0]?.driverId,
    constructorChampionId: universe.season.ruleset.constructorsChampionship ? teamStandings[0]?.teamId : undefined,
    managementEvents: structuredClone(universe.managementEvents.filter((event) => event.season === universe.season.year)),
    aiDecisions: structuredClone(universe.aiDecisions.filter((decision) => decision.season === universe.season.year)),
  };
}

function progressDrivers(universe: NormalizedUniverse, targetSeason: number): void {
  const nextDrivers: NormalizedDriver[] = [];
  for (const driver of universe.season.drivers) {
    if (driver.status === "retired") {
      nextDrivers.push(driver);
      continue;
    }
    const team = universe.season.teams.find((candidate) => candidate.driverIds.includes(driver.id));
    const developed = developDriverCareer(driver, {
      seed: universe.baseSeed,
      season: targetSeason,
      config: universe.worldConfig,
      team,
      opportunity: team ? team.facilities / 100 : 0.35,
    });
    const next = developed.driver;
    const decision = evaluateRetirement(next, {
      seed: universe.baseSeed,
      season: targetSeason,
      config: universe.worldConfig,
      recentOverallDelta: developed.overallDelta,
      yearsWithoutF1Seat: team ? 0 : 1,
      competitiveOfferScore: team ? 80 : next.reputation,
    });
    if (decision.retire) {
      next.status = "retired";
      universe.managementEvents.push({
        id: `management-retirement-${targetSeason}-${next.id}`,
        season: targetSeason,
        type: "retirement",
        summary: `${next.givenName} ${next.familyName} retired after an autonomous career review (${Math.round(decision.probability * 100)}% retirement probability).`,
        driverIds: [next.id],
        teamIds: team ? [team.id] : [],
        createdAt: timestamp(targetSeason, universe.managementEvents.length),
      });
    }
    if (Math.abs(developed.overallDelta) >= 0.2) {
      universe.managementEvents.push({
        id: `management-driver-development-${targetSeason}-${next.id}`,
        season: targetSeason,
        type: "development",
        summary: `${next.givenName} ${next.familyName} ${developed.overallDelta >= 0 ? "improved" : "declined"} ${Math.abs(developed.overallDelta).toFixed(1)} overall points to ${developed.afterOverall.toFixed(1)}.`,
        driverIds: [next.id],
        teamIds: team ? [team.id] : [],
        createdAt: timestamp(targetSeason, universe.managementEvents.length),
      });
    }
    nextDrivers.push(next);
  }
  universe.season.drivers = nextDrivers;
}

function resetSeason(universe: NormalizedUniverse, targetSeason: number): void {
  universe.season.year = targetSeason;
  universe.season.ruleset.year = targetSeason;
  universe.season.ruleset.id = `rules-${targetSeason}-${universe.id}`;
  universe.season.weekends = universe.season.weekends.map((weekend) => ({ ...weekend, id: `${targetSeason}-round-${weekend.round}` }));
  universe.season.currentRoundIndex = 0;
  universe.season.currentWeekend = undefined;
  universe.season.completedWeekends = [];
  universe.season.driverStandings = activeDriverIds(universe).map((driverId) => ({ driverId, points: 0, wins: 0, podiums: 0, poles: 0, finishes: {} }));
  universe.season.teamStandings = universe.season.teams.map((team) => ({ teamId: team.id, points: 0, wins: 0 }));
  universe.season.teamUpgrades = [];
  universe.season.performance = undefined;
  universe.season.rulesLocked = false;
  universe.season.offseasonProposal = undefined;
  universe.season.phase = "preseason";
}

/** Complete a dynasty offseason without requiring a manual proposal approval. */
export function runAutonomousOffseason(input: Universe): NormalizedUniverse {
  return runAutonomousOffseasonInPlace(normalizeUniverse(input));
}

/** Complete an offseason on a working normalized universe. */
export function runAutonomousOffseasonInPlace(input: NormalizedUniverse): NormalizedUniverse {
  let universe = input;
  if (universe.mode !== "dynasty" || universe.season.phase !== "season-complete") throw new Error("Autonomous offseason requires a completed dynasty season.");
  updateCareerStats(universe);
  const archive = archiveSeason(universe);
  // The working universe may share this array with the previous immutable
  // checkpoint. Copy just the container before appending the new archive.
  universe.seasonHistory = [...universe.seasonHistory];
  universe.seasonHistory.push(archive);
  const targetSeason = universe.season.year + 1;
  progressDrivers(universe, targetSeason);
  universe = evolveTeamsForNextSeasonInPlace(universe, targetSeason).universe;
  const juniors = advanceJuniorEcosystem({ seed: universe.baseSeed, season: universe.season.year, config: universe.worldConfig, drivers: universe.season.drivers, teams: universe.season.teams, juniorState: universe.juniorState });
  universe.season.drivers = juniors.drivers;
  universe.juniorState = juniors.juniorState;
  for (const summary of juniors.events) universe.managementEvents.push({ id: `management-junior-${targetSeason}-${universe.managementEvents.length}`, season: targetSeason, type: summary.includes("academy") ? "promotion" : "development", summary, driverIds: [], teamIds: [], createdAt: timestamp(targetSeason, universe.managementEvents.length) });
  const market = resolveAutonomousContractMarketInPlace(universe, targetSeason);
  universe = market.universe;
  resetSeason(universe, targetSeason);
  universe.audit.push({ id: `audit-autonomous-offseason-${targetSeason}`, action: "autonomous-offseason", summary: `Completed autonomous offseason for ${targetSeason}: ${market.summary.renewed.length} renewals, ${market.summary.signed.length} signings, ${juniors.promotedToF2DriverIds.length} junior promotions, and ${juniors.incomingDriverIds.length} new prospects.`, at: timestamp(targetSeason, universe.audit.length) });
  universe.updatedAt = timestamp(targetSeason, universe.audit.length);
  return universe;
}

/** Run one or more complete seasons, pausing only at the next preseason. */
export function simulateAutonomousSeasons(input: Universe, seasons = 1): NormalizedUniverse {
  let universe = normalizeUniverse(input);
  const count = Math.max(0, Math.floor(seasons));
  for (let index = 0; index < count; index += 1) {
    if (universe.season.phase !== "season-complete") universe = normalizeUniverse(fastForwardSeason(universe));
    universe = runAutonomousOffseasonInPlace(universe);
  }
  return universe;
}

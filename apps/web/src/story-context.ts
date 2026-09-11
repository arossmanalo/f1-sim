import type { NarrativeStoryContext, Universe } from "@f1-sim/core";

function driverName(universe: Universe, driverId: string): string {
  const driver = universe.season.drivers.find((candidate) => candidate.id === driverId);
  return driver ? `${driver.givenName} ${driver.familyName}` : "Unknown driver";
}

function teamName(universe: Universe, teamId: string): string {
  return universe.season.teams.find((team) => team.id === teamId)?.name ?? "Unknown team";
}

function averageRating(driver: Universe["season"]["drivers"][number]): number {
  const ratings = Object.values(driver.ratings);
  return Math.round(ratings.reduce((total, value) => total + value, 0) / ratings.length);
}

function finishLabel(position: number | undefined): string {
  return position ? `P${position}` : "no classified finish";
}

export function buildNarrativeStoryContext(universe: Universe): NarrativeStoryContext {
  const season = universe.season;
  const validRaces = season.completedWeekends.filter((weekend) => !weekend.voided);
  const latest = validRaces.at(-1);
  const activeEvents = season.currentWeekend?.race.events ?? [];
  const eventPool = [...validRaces.flatMap((race) => race.events), ...activeEvents];
  const leader = [...season.driverStandings].sort((a, b) => b.points - a.points || a.driverId.localeCompare(b.driverId))[0];
  const runnerUp = [...season.driverStandings].sort((a, b) => b.points - a.points || a.driverId.localeCompare(b.driverId))[1];
  const latestWinner = latest?.race[0];
  const latestUpgrades = (season.teamUpgrades ?? []).slice(-8);
  const currentRound = season.currentWeekend?.weekend.round ?? season.currentRoundIndex;
  const seasonArc: string[] = [
    currentRound === 0
      ? `Preseason is set for a ${season.weekends.length}-round championship.`
      : `Round ${Math.min(currentRound, season.weekends.length)} of ${season.weekends.length} is ${season.currentWeekend ? "live" : "complete"}.`,
  ];
  if (leader) {
    seasonArc.push(`${driverName(universe, leader.driverId)} leads the championship on ${leader.points} points${runnerUp ? `, with ${Math.max(0, leader.points - runnerUp.points)} points over ${driverName(universe, runnerUp.driverId)}` : ""}.`);
  }
  if (latestWinner) seasonArc.push(`${driverName(universe, latestWinner.driverId)} won the latest completed race at ${latest?.weekend.name}.`);
  if (latestUpgrades.length) seasonArc.push(`${latestUpgrades.length} car-development packages have landed between weekends; the latest is ${latestUpgrades.at(-1)?.summary}`);
  if (validRaces.length) {
    const retirements = eventPool.filter((event) => event.type === "retirement").length;
    seasonArc.push(`${validRaces.length} race${validRaces.length === 1 ? "" : "s"} have produced ${retirements} recorded retirement${retirements === 1 ? "" : "s"}.`);
  }

  const rivalries: NarrativeStoryContext["rivalries"] = [];
  const seenPairs = new Set<string>();
  const addRivalry = (aId: string, bId: string, title: string) => {
    const pair = [aId, bId].sort().join("|");
    if (aId === bId || seenPairs.has(pair)) return;
    seenPairs.add(pair);
    const aStanding = season.driverStandings.find((standing) => standing.driverId === aId);
    const bStanding = season.driverStandings.find((standing) => standing.driverId === bId);
    const aLatest = latest?.race.find((entry) => entry.driverId === aId)?.position;
    const bLatest = latest?.race.find((entry) => entry.driverId === bId)?.position;
    rivalries.push({
      title,
      drivers: [driverName(universe, aId), driverName(universe, bId)],
      summary: `${driverName(universe, aId)} has ${aStanding?.points ?? 0} points (${finishLabel(aLatest)} last time out); ${driverName(universe, bId)} has ${bStanding?.points ?? 0} points (${finishLabel(bLatest)} last time out).`,
    });
  };
  const topDrivers = [...season.driverStandings].sort((a, b) => b.points - a.points).slice(0, 4);
  if (topDrivers.length >= 2) addRivalry(topDrivers[0]!.driverId, topDrivers[1]!.driverId, "The championship fight");
  for (const team of season.teams) {
    const [first, second] = team.driverIds;
    const firstStanding = season.driverStandings.find((standing) => standing.driverId === first);
    const secondStanding = season.driverStandings.find((standing) => standing.driverId === second);
    if (firstStanding && secondStanding && Math.abs(firstStanding.points - secondStanding.points) <= 35) {
      addRivalry(first, second, `${team.shortName} teammate tension`);
    }
  }
  const clashes = new Map<string, number>();
  for (const event of eventPool.filter((candidate) => ["overtake", "incident", "penalty", "lead-change"].includes(candidate.type))) {
    for (let index = 0; index < event.driverIds.length; index += 1) {
      for (let other = index + 1; other < event.driverIds.length; other += 1) {
        const pair = [event.driverIds[index]!, event.driverIds[other]!].sort().join("|");
        clashes.set(pair, (clashes.get(pair) ?? 0) + 1);
      }
    }
  }
  for (const [pair, count] of [...clashes.entries()].sort((a, b) => b[1] - a[1])) {
    if (rivalries.length >= 6) break;
    const [first, second] = pair.split("|");
    const before = rivalries.length;
    if (first && second) addRivalry(first, second, "A rivalry written on track");
    const rivalry = rivalries.length > before ? rivalries.at(-1) : undefined;
    if (rivalry) rivalry.summary += ` Their names have appeared together in ${count} on-track flashpoint${count === 1 ? "" : "s"}.`;
  }
  for (let index = 1; index < topDrivers.length && rivalries.length < 4; index += 1) {
    addRivalry(topDrivers[0]!.driverId, topDrivers[index]!.driverId, "The leading pack");
  }

  const teamDramas = season.teams.map((team) => {
    const standing = season.teamStandings.find((entry) => entry.teamId === team.id);
    const upgrades = (season.teamUpgrades ?? []).filter((upgrade) => upgrade.teamId === team.id);
    const incidents = eventPool.filter((event) => event.teamIds.includes(team.id) && event.severity !== "routine").length;
    const latestUpgrade = upgrades.at(-1);
    const summary = latestUpgrade
      ? `${team.name} sits on ${standing?.points ?? 0} points and is carrying a development swing: ${latestUpgrade.summary}${incidents ? ` ${incidents} notable team-linked moments have added pressure.` : ""}`
      : `${team.name} sits on ${standing?.points ?? 0} points with ${incidents} notable team-linked moments so far; the garage is still searching for a decisive turn.`;
    return { team: team.name, summary };
  }).sort((a, b) => b.summary.length - a.summary.length).slice(0, 8);

  const driverTrajectories = [...season.drivers]
    .map((driver) => {
      const standing = season.driverStandings.find((entry) => entry.driverId === driver.id);
      const rating = averageRating(driver);
      const gap = driver.potential - rating;
      const trend = driver.age >= 36 ? "veteran decline and title pressure" : gap >= 8 ? "developing toward a higher ceiling" : gap <= -8 ? "performing above projected potential" : "holding a steady competitive level";
      return { name: `${driver.givenName} ${driver.familyName}`, age: driver.age, potential: driver.potential, rating, points: standing?.points ?? 0, trend };
    })
    .sort((a, b) => b.points - a.points)
    .slice(0, 12);

  const teamTrajectories = season.teams.map((team) => {
    const standing = season.teamStandings.find((entry) => entry.teamId === team.id);
    const upgrades = (season.teamUpgrades ?? []).filter((upgrade) => upgrade.teamId === team.id);
    const net = upgrades.reduce((sum, upgrade) => sum + upgrade.delta, 0);
    return { team: team.name, points: standing?.points ?? 0, trend: net > 0 ? "gaining momentum through development" : net < 0 ? "under development pressure" : "awaiting a breakthrough", upgrades: upgrades.length };
  }).sort((a, b) => b.points - a.points);

  return {
    seasonArc,
    // Keep the payload inside the server contract even when a full grid
    // produces many close teammate and on-track pairings.
    rivalries: rivalries.slice(0, 8),
    teamDramas,
    driverTrajectories,
    teamTrajectories,
    upgrades: latestUpgrades.map((upgrade) => ({ team: teamName(universe, upgrade.teamId), round: upgrade.round, summary: upgrade.summary })),
  };
}

import type { DriverStanding, RaceResultEntry, SeasonState, TeamStanding } from "./types";

export interface ClinchLine {
  leaderId?: string;
  clinched: boolean;
  margin: number;
  leaderPoints: number;
  maximumRivalPoints: number;
}

export interface ChampionshipClinch {
  wdc: ClinchLine;
  wcc: ClinchLine;
}

export function sortDriverStandings(standings: DriverStanding[]): DriverStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    for (let position = 2; position <= 30; position += 1) {
      const difference = (b.finishes[position] ?? 0) - (a.finishes[position] ?? 0);
      if (difference !== 0) return difference;
    }
    return a.driverId.localeCompare(b.driverId);
  });
}

export function sortTeamStandings(standings: TeamStanding[]): TeamStanding[] {
  return [...standings].sort((a, b) => b.points - a.points || b.wins - a.wins || a.teamId.localeCompare(b.teamId));
}

export function rebuildStandings(
  driverIds: string[],
  teamIds: string[],
  completed: Array<{ qualifying: RaceResultEntry[]; sprint?: RaceResultEntry[]; race: RaceResultEntry[]; voided: boolean }>,
): { drivers: DriverStanding[]; teams: TeamStanding[] } {
  const drivers = new Map<string, DriverStanding>();
  const teams = new Map<string, TeamStanding>();
  for (const id of driverIds) drivers.set(id, { driverId: id, points: 0, wins: 0, podiums: 0, poles: 0, finishes: {} });
  for (const id of teamIds) teams.set(id, { teamId: id, points: 0, wins: 0 });

  for (const weekend of completed.filter((item) => !item.voided)) {
    const pole = weekend.qualifying[0];
    if (pole) drivers.get(pole.driverId)!.poles += 1;
    for (const result of weekend.sprint ?? []) {
      const driver = drivers.get(result.driverId);
      const team = teams.get(result.teamId);
      if (!driver || !team) continue;
      driver.points += result.points;
      team.points += result.points;
    }
    for (const result of weekend.race) {
      const driver = drivers.get(result.driverId);
      const team = teams.get(result.teamId);
      if (!driver || !team) continue;
      driver.points += result.points;
      team.points += result.points;
      if (result.position === 1 && result.points > 0) {
        driver.wins += 1;
        team.wins += 1;
      }
      if (result.position <= 3 && result.points > 0) driver.podiums += 1;
      driver.finishes[result.position] = (driver.finishes[result.position] ?? 0) + 1;
    }
  }

  return { drivers: sortDriverStandings([...drivers.values()]), teams: sortTeamStandings([...teams.values()]) };
}

function maximumPoints(rules: Array<{ points: number }>): number {
  return rules.reduce((maximum, rule) => Math.max(maximum, rule.points), 0);
}

function maximumTwoCarPoints(rules: Array<{ points: number }>): number {
  return [...rules].sort((a, b) => b.points - a.points).slice(0, 2).reduce((total, rule) => total + rule.points, 0);
}

/**
 * A title is clinched only when the leader's current score is strictly above
 * every rival's best possible score across all unfinalized weekends.
 */
export function getChampionshipClinch(season: Pick<SeasonState, "currentRoundIndex" | "weekends" | "ruleset" | "driverStandings" | "teamStandings">): ChampionshipClinch {
  const remaining = season.weekends.slice(season.currentRoundIndex);
  const remainingRaces = remaining.length;
  const remainingSprints = remaining.filter((weekend) => weekend.sprint).length;
  const driverMaximumRemaining = remainingRaces * maximumPoints(season.ruleset.points) + remainingSprints * maximumPoints(season.ruleset.sprintPoints);
  const teamMaximumRemaining = remainingRaces * maximumTwoCarPoints(season.ruleset.points) + remainingSprints * maximumTwoCarPoints(season.ruleset.sprintPoints);

  const driverLeader = season.driverStandings[0];
  const driverRivalMaximum = season.driverStandings.slice(1).reduce((maximum, standing) => Math.max(maximum, standing.points + driverMaximumRemaining), 0);
  const teamLeader = season.teamStandings[0];
  const teamRivalMaximum = season.teamStandings.slice(1).reduce((maximum, standing) => Math.max(maximum, standing.points + teamMaximumRemaining), 0);
  return {
    wdc: {
      leaderId: driverLeader?.driverId,
      clinched: Boolean(driverLeader && season.driverStandings.length > 1 && (driverLeader.points > driverRivalMaximum || (remainingRaces === 0 && driverLeader.points >= driverRivalMaximum))),
      margin: driverLeader ? driverLeader.points - driverRivalMaximum : 0,
      leaderPoints: driverLeader?.points ?? 0,
      maximumRivalPoints: driverRivalMaximum,
    },
    wcc: {
      leaderId: teamLeader?.teamId,
      clinched: Boolean(season.ruleset.constructorsChampionship && teamLeader && season.teamStandings.length > 1 && (teamLeader.points > teamRivalMaximum || (remainingRaces === 0 && teamLeader.points >= teamRivalMaximum))),
      margin: teamLeader ? teamLeader.points - teamRivalMaximum : 0,
      leaderPoints: teamLeader?.points ?? 0,
      maximumRivalPoints: teamRivalMaximum,
    },
  };
}

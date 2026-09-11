import { Medal, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { useSimulator } from "../simulator-context";

type RecordScope = "all" | "simulation" | "reality";
type RecordRow = { name: string; team?: string; value: number; source: "simulation" | "reality" };

const realityRows: RecordRow[] = [
  { name: "Lewis Hamilton", value: 7, source: "reality" },
  { name: "Michael Schumacher", value: 7, source: "reality" },
  { name: "Ferrari", value: 16, source: "reality" },
  { name: "Lewis Hamilton", value: 105, source: "reality" },
  { name: "Lewis Hamilton", value: 104, source: "reality" },
  { name: "Lewis Hamilton", value: 202, source: "reality" },
];

function simulationRows(universes: ReturnType<typeof useSimulator>["universes"]): RecordRow[] {
  const drivers = new Map<string, { name: string; wdc: number; wins: number; poles: number; podiums: number }>();
  const teams = new Map<string, { name: string; wcc: number; wins: number }>();
  for (const universe of universes) {
    const seasons = [...(universe.seasonHistory ?? []), {
      year: universe.season.year,
      drivers: universe.season.drivers,
      teams: universe.season.teams,
      completedWeekends: universe.season.completedWeekends,
      driverStandings: universe.season.driverStandings,
      teamStandings: universe.season.teamStandings,
    }];
    for (const season of seasons) {
      const valid = season.completedWeekends.filter((weekend) => !weekend.voided);
      const champion = [...season.driverStandings].sort((a, b) => b.points - a.points || b.wins - a.wins)[0];
      const championDriver = season.drivers.find((driver) => driver.id === champion?.driverId);
      if (championDriver) {
        const row = drivers.get(championDriver.id) ?? { name: `${championDriver.givenName} ${championDriver.familyName}`, wdc: 0, wins: 0, poles: 0, podiums: 0 };
        row.wdc += 1;
        drivers.set(championDriver.id, row);
      }
      for (const standing of season.driverStandings) {
        const driver = season.drivers.find((item) => item.id === standing.driverId);
        if (!driver) continue;
        const row = drivers.get(driver.id) ?? { name: `${driver.givenName} ${driver.familyName}`, wdc: 0, wins: 0, poles: 0, podiums: 0 };
        row.wins += standing.wins;
        row.poles += standing.poles;
        row.podiums += standing.podiums;
        drivers.set(driver.id, row);
      }
      const teamChampion = [...season.teamStandings].sort((a, b) => b.points - a.points || b.wins - a.wins)[0];
      const championTeam = season.teams.find((team) => team.id === teamChampion?.teamId);
      if (championTeam && valid.length > 0) {
        const row = teams.get(championTeam.id) ?? { name: championTeam.name, wcc: 0, wins: 0 };
        row.wcc += 1;
        teams.set(championTeam.id, row);
      }
      for (const standing of season.teamStandings) {
        const team = season.teams.find((item) => item.id === standing.teamId);
        if (!team) continue;
        const row = teams.get(team.id) ?? { name: team.name, wcc: 0, wins: 0 };
        row.wins += standing.wins;
        teams.set(team.id, row);
      }
    }
  }
  const rows: RecordRow[] = [];
  const top = (field: "wdc" | "wins" | "poles" | "podiums", label: string) => {
    const winner = [...drivers.values()].sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name))[0];
    if (winner && winner[field] > 0) rows.push({ name: winner.name, team: label, value: winner[field], source: "simulation" });
  };
  top("wdc", "Simulated WDCs");
  top("wins", "Simulated wins");
  top("poles", "Simulated poles");
  top("podiums", "Simulated podiums");
  const teamWinner = [...teams.values()].sort((a, b) => b.wcc - a.wcc || a.name.localeCompare(b.name))[0];
  if (teamWinner && teamWinner.wcc > 0) rows.push({ name: teamWinner.name, team: "Simulated WCCs", value: teamWinner.wcc, source: "simulation" });
  return rows;
}

export function RecordsView() {
  const { universes } = useSimulator();
  const [scope, setScope] = useState<RecordScope>("all");
  const simulated = useMemo(() => simulationRows(universes), [universes]);
  const rows = [...(scope === "reality" ? [] : simulated), ...(scope === "simulation" ? [] : realityRows)];
  return <div className="page-stack records-page">
    <header className="page-heading"><span>Championship ledger</span><h1>Records</h1><p>Compare the permanent marks from your simulated history with the bundled real-world reference board.</p></header>
    <div className="records-toolbar" role="group" aria-label="Record source"><label>Show records<select value={scope} onChange={(event) => setScope(event.target.value as RecordScope)}><option value="all">All history</option><option value="simulation">Simulation only</option><option value="reality">Reality only</option></select></label><span><Medal /> Values are grouped by record type.</span></div>
    <section className="records-board"><div className="section-heading"><div><span>{scope === "all" ? "All history" : scope === "simulation" ? "Your universes" : "Bundled reference"}</span><h2>Record holders</h2></div><Trophy /></div><div className="records-table"><div className="records-row records-row--head"><span>Holder</span><span>Record</span><span>Value</span><span>Source</span></div>{rows.map((row, index) => <div className="records-row" key={`${row.source}-${row.team}-${row.name}-${index}`}><strong>{row.name}</strong><span>{row.team}</span><b>{row.value}</b><small>{row.source}</small></div>)}{rows.length === 0 && <p className="empty-note">Complete a dynasty season to start building simulation records.</p>}</div></section>
  </div>;
}

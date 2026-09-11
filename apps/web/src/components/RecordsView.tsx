import { Medal, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { useSimulator } from "../simulator-context";

type RecordScope = "all" | "simulation" | "reality";
type RecordCategory = "wdc" | "wcc" | "wins" | "poles" | "podiums";
type RecordRow = { holder: string; category: RecordCategory; value: number; source: "simulation" | "reality"; rank?: number };
type DriverTotals = { holder: string; wdc: number; wins: number; poles: number; podiums: number };
type TeamTotals = { holder: string; wcc: number };

const categoryLabels: Record<RecordCategory, string> = {
  wdc: "World Drivers' Championships",
  wcc: "World Constructors' Championships",
  wins: "Race wins",
  poles: "Pole positions",
  podiums: "Podium finishes",
};

// This reference board is immutable and never written back to a simulation save.
const realityRows: RecordRow[] = [
  { holder: "Lewis Hamilton", category: "wdc", value: 7, source: "reality" },
  { holder: "Michael Schumacher", category: "wdc", value: 7, source: "reality" },
  { holder: "Juan Manuel Fangio", category: "wdc", value: 5, source: "reality" },
  { holder: "Alain Prost", category: "wdc", value: 4, source: "reality" },
  { holder: "Sebastian Vettel", category: "wdc", value: 4, source: "reality" },
  { holder: "Ferrari", category: "wcc", value: 16, source: "reality" },
  { holder: "McLaren", category: "wcc", value: 10, source: "reality" },
  { holder: "Williams", category: "wcc", value: 9, source: "reality" },
  { holder: "Mercedes", category: "wcc", value: 8, source: "reality" },
  { holder: "Lewis Hamilton", category: "wins", value: 105, source: "reality" },
  { holder: "Michael Schumacher", category: "wins", value: 91, source: "reality" },
  { holder: "Sebastian Vettel", category: "wins", value: 53, source: "reality" },
  { holder: "Alain Prost", category: "wins", value: 51, source: "reality" },
  { holder: "Lewis Hamilton", category: "poles", value: 104, source: "reality" },
  { holder: "Michael Schumacher", category: "poles", value: 68, source: "reality" },
  { holder: "Ayrton Senna", category: "poles", value: 65, source: "reality" },
  { holder: "Sebastian Vettel", category: "poles", value: 57, source: "reality" },
  { holder: "Lewis Hamilton", category: "podiums", value: 202, source: "reality" },
  { holder: "Michael Schumacher", category: "podiums", value: 155, source: "reality" },
  { holder: "Sebastian Vettel", category: "podiums", value: 140, source: "reality" },
  { holder: "Alain Prost", category: "podiums", value: 106, source: "reality" },
];

function simulationRows(universes: ReturnType<typeof useSimulator>["universes"]): RecordRow[] {
  const drivers = new Map<string, DriverTotals>();
  const teams = new Map<string, TeamTotals>();
  const addDriver = (holder: string) => {
    const key = holder.toLocaleLowerCase();
    const existing = drivers.get(key) ?? { holder, wdc: 0, wins: 0, poles: 0, podiums: 0 };
    drivers.set(key, existing);
    return existing;
  };
  const addTeam = (holder: string) => {
    const key = holder.toLocaleLowerCase();
    const existing = teams.get(key) ?? { holder, wcc: 0 };
    teams.set(key, existing);
    return existing;
  };

  for (const universe of universes) {
    const seasons = [
      ...(universe.seasonHistory ?? []).map((season) => ({ ...season, complete: true })),
      {
        year: universe.season.year,
        drivers: universe.season.drivers,
        teams: universe.season.teams,
        completedWeekends: universe.season.completedWeekends,
        driverStandings: universe.season.driverStandings,
        teamStandings: universe.season.teamStandings,
        complete: universe.season.phase === "season-complete" || universe.season.phase === "offseason",
      },
    ];
    for (const season of seasons) {
      const validWeekends = season.completedWeekends.filter((weekend) => !weekend.voided);
      if (validWeekends.length === 0) continue;
      const champion = season.complete ? season.driverStandings[0] : undefined;
      const championDriver = season.drivers.find((driver) => driver.id === champion?.driverId);
      if (championDriver) addDriver(`${championDriver.givenName} ${championDriver.familyName}`).wdc += 1;
      for (const standing of season.driverStandings) {
        const driver = season.drivers.find((item) => item.id === standing.driverId);
        if (!driver) continue;
        const total = addDriver(`${driver.givenName} ${driver.familyName}`);
        total.wins += standing.wins;
        total.poles += standing.poles;
        total.podiums += standing.podiums;
      }
      const teamChampion = season.complete ? season.teamStandings[0] : undefined;
      const championTeam = season.teams.find((team) => team.id === teamChampion?.teamId);
      if (championTeam) addTeam(championTeam.name).wcc += 1;
    }
  }

  const rows: RecordRow[] = [];
  for (const total of drivers.values()) {
    for (const category of ["wdc", "wins", "poles", "podiums"] as const) if (total[category] > 0) rows.push({ holder: total.holder, category, value: total[category], source: "simulation" });
  }
  for (const total of teams.values()) if (total.wcc > 0) rows.push({ holder: total.holder, category: "wcc", value: total.wcc, source: "simulation" });
  return rows;
}

function rankRows(rows: RecordRow[]): RecordRow[] {
  return (Object.keys(categoryLabels) as RecordCategory[]).flatMap((category) => {
    const categoryRows = rows.filter((row) => row.category === category).sort((a, b) => b.value - a.value || a.holder.localeCompare(b.holder));
    return categoryRows.slice(0, 10).map((row, index) => ({ ...row, rank: index + 1 }));
  });
}

export function RecordsView() {
  const { universes } = useSimulator();
  const [scope, setScope] = useState<RecordScope>("all");
  const simulated = useMemo(() => simulationRows(universes), [universes]);
  const rows = useMemo(() => rankRows([...(scope === "reality" ? [] : simulated), ...(scope === "simulation" ? [] : realityRows)]), [scope, simulated]);
  return <div className="page-stack records-page">
    <header className="page-heading"><span>Championship ledger</span><h1>All-time record book</h1><p>Rank the leading holders for every headline record across your simulated universes and the bundled real-world reference board.</p></header>
    <div className="records-toolbar" role="group" aria-label="Record source"><label>Show records<select value={scope} onChange={(event) => setScope(event.target.value as RecordScope)}><option value="all">All history</option><option value="simulation">Simulation only</option><option value="reality">Reality only</option></select></label><span><Medal /> One merged ranking per record category.</span></div>
    <section className="records-board"><div className="section-heading"><div><span>{scope === "all" ? "Merged history" : scope === "simulation" ? "Your universes" : "Bundled reference"}</span><h2>Top record holders</h2></div><Trophy /></div><div className="records-table"><div className="records-row records-row--head"><span>Rank</span><span>Holder</span><span>Record</span><span>Value</span><span>Source</span></div>{rows.map((row) => <div className="records-row" key={`${row.source}-${row.category}-${row.holder}`}><b className="record-rank">{row.rank}</b><strong>{row.holder}</strong><span>{categoryLabels[row.category]}</span><b>{row.value}</b><small>{row.source}</small></div>)}{rows.length === 0 && <p className="empty-note">Complete a dynasty season to start building simulation records.</p>}</div></section>
  </div>;
}

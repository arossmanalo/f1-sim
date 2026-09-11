import { GitCompareArrows, Trophy } from "lucide-react";
import { displayName } from "../format";
import { useSimulator } from "../simulator-context";

const reality: Record<number, { driver: string; team: string; note: string }> = {
  2005: { driver: "Fernando Alonso", team: "Renault", note: "Completed historical championship" },
  2026: { driver: "Season in progress", team: "Season in progress", note: "The real championship remains incomplete at the bundled snapshot date" },
};

export function CompareView() {
  const { current } = useSimulator();
  if (!current) return null;
  const reference = reality[current.season.year];
  const driverLeader = current.season.driverStandings[0];
  const teamLeader = current.season.teamStandings[0];
  const driver = current.season.drivers.find((item) => item.id === driverLeader?.driverId);
  const team = current.season.teams.find((item) => item.id === teamLeader?.teamId);
  return <div className="page-stack compare-page">
    <header className="page-heading"><span>Optional reference</span><h1>Reality / simulation</h1><p>This view never changes ratings, results, or the alternate timeline.</p></header>
    <section className="comparison-board"><div className="comparison-side"><span>Recorded season</span><h2>{reference?.driver ?? "Reference unavailable"}</h2><p>Drivers’ champion</p><h3>{reference?.team ?? "—"}</h3><p>Constructors’ champion</p><small>{reference?.note ?? "No bundled comparison record for this year."}</small></div><div className="comparison-axis"><GitCompareArrows /><span>{current.season.year}</span></div><div className="comparison-side comparison-side--sim"><span>{current.name}</span><h2>{driverLeader?.points ? displayName(driver) : "Championship level"}</h2><p>{driverLeader?.points ?? 0} simulated points</p><h3>{teamLeader?.points ? team?.name : "No leader yet"}</h3><p>{teamLeader?.points ?? 0} constructor points</p><small>{current.season.completedWeekends.filter((item) => !item.voided).length} of {current.season.weekends.length} rounds finalized</small></div></section>
    <div className="comparison-note"><Trophy /><span><strong>Alternate history stays sovereign.</strong> Real-world outcomes are context, never corrective input.</span></div>
  </div>;
}

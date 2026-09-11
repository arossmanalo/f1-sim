import { CalendarDays, Flag, Gauge, Plus, Trophy } from "lucide-react";
import { useSimulator } from "../simulator-context";

function phaseLabel(phase: string): string {
  if (phase === "between-weekends") return "Season active";
  if (phase === "season-complete") return "Season complete";
  if (phase === "session") return "Live weekend";
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function HomeView({ onNew = () => undefined }: { onNew?: () => void }) {
  const { universes, current, selectUniverse, setView } = useSimulator();
  const totalRounds = universes.reduce((sum, universe) => sum + universe.season.weekends.length, 0);
  const completedRounds = universes.reduce((sum, universe) => sum + universe.season.completedWeekends.filter((weekend) => !weekend.voided).length, 0);
  return <div className="page-stack home-page">
    <header className="page-heading home-heading"><span>Race control library</span><h1>Your season garage</h1><p>Pick up a saved universe, or create a new alternate championship. Every slot is stored locally in this browser.</p><button className="button button--signal" onClick={onNew}><Plus /> New universe</button></header>
    <section className="home-summary" aria-label="Save library summary">
      <div><small>Save slots</small><strong>{universes.length}</strong></div>
      <div><small>Rounds completed</small><strong>{completedRounds}<em> / {totalRounds || 0}</em></strong></div>
      <div><small>Active slot</small><strong>{current?.season.year ?? "—"}</strong></div>
    </section>
    <section className="save-library">
      <div className="section-heading"><div><span>Local saves</span><h2>Choose a universe</h2></div><Flag /></div>
      {universes.length === 0 ? <div className="home-empty"><Gauge /><h2>No universes yet</h2><p>Create your first season to populate the garage board.</p><button className="button button--signal" onClick={onNew}><Plus /> Create universe</button></div> : <div className="save-slot-grid">{universes.map((universe) => {
        const completed = universe.season.completedWeekends.filter((weekend) => !weekend.voided).length;
        const next = universe.season.weekends[universe.season.currentRoundIndex];
        const isActive = universe.id === current?.id;
        return <article className={`save-slot ${isActive ? "save-slot--active" : ""}`} key={universe.id}>
          <div className="save-slot__top"><span>{universe.mode === "dynasty" ? "Dynasty" : "Standalone"}</span><small>{new Date(universe.updatedAt).toLocaleDateString()}</small></div>
          <h3>{universe.name}</h3>
          <div className="save-slot__season"><strong>{universe.season.year}</strong><span>{phaseLabel(universe.season.phase)}</span></div>
          <div className="save-slot__meta"><span><CalendarDays /> {completed} / {universe.season.weekends.length} rounds</span><span><Trophy /> {next?.name ?? "Archive ready"}</span></div>
          <button className="button button--dark button--full" onClick={() => { selectUniverse(universe.id); setView("command"); }}>{isActive ? "Open season command" : "Load universe"}</button>
        </article>;
      })}</div>}
    </section>
  </div>;
}

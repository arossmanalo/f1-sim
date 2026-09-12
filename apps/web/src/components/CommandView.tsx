import { ArrowRight, Check, Download, FastForward, Flag, GitFork, Minus, Plus, Radio, RefreshCw, Route, Sparkles, Trophy } from "lucide-react";
import { useSimulator } from "../simulator-context";
import { displayName } from "../format";
import { CircuitMap } from "./CircuitMap";

export function CommandView() {
  const { current, beginWeekend, simulateSeason, simulateAutonomousSeasons, setView, branch, exportCurrent, refreshData, advancePhase, editOffseasonRating, confirm } = useSimulator();
  if (!current) return null;
  const season = current.season;
  const next = season.weekends[season.currentRoundIndex];
  const circuit = season.circuits.find((item) => item.id === next?.circuitId);
  const leader = season.driverStandings[0];
  const leaderDriver = season.drivers.find((driver) => driver.id === leader?.driverId);
  const completed = season.completedWeekends.filter((weekend) => !weekend.voided).length;
  const progress = season.weekends.length ? Math.round((completed / season.weekends.length) * 100) : 0;

  return (
    <div className="command-view">
      <section className="command-hero">
        <div className="hero-copy">
          <span className="session-kicker"><span className="status-lamp status-lamp--ready" /> {season.phase.replace("-", " ")}</span>
          <h1>{next ? next.name : `${season.year} season complete`}</h1>
          <p>{next && circuit ? `${circuit.name}, ${circuit.city}. ${circuit.profile.lapCount} laps await.` : current.mode === "dynasty" ? "Review the final tables, then prepare the next offseason package." : "The alternate history is now sealed."}</p>
          <div className="hero-actions">
            {season.phase === "preseason" && <button className="button button--signal" onClick={() => void advancePhase()}><ArrowRight size={18} /> Enter season</button>}
            {next && season.phase !== "preseason" && !season.currentWeekend && <button className="button button--signal" onClick={() => void beginWeekend().then(() => setView("live"))}><Radio size={18} /> Start weekend</button>}
            {season.currentWeekend && <button className="button button--signal" onClick={() => setView("live")}><Radio size={18} /> Return to live timing</button>}
            {season.phase === "season-complete" && current.mode === "dynasty" && <button className="button button--signal" onClick={() => void advancePhase()}><ArrowRight size={18} /> Open offseason</button>}
            {season.phase === "offseason" && <button className="button button--signal" onClick={() => void advancePhase()}><Check size={18} /> Accept offseason package</button>}
            {season.phase === "between-weekends" && <button className="button button--dark" onClick={() => void confirm({ title: "Finish the season?", message: "Every remaining round will be simulated without live interventions. This cannot be undone once results are finalized.", confirmLabel: "Finish season" }).then((approved) => { if (approved) void simulateSeason(); })}><FastForward size={18} /> Finish season</button>}
            {current.mode === "dynasty" && <button className="button button--dark" onClick={() => void confirm({ title: "Run autonomous seasons?", message: "The race director will run five complete seasons, including team development, driver careers, junior intake, retirements, and contract decisions. Results are deterministic for this seed.", confirmLabel: "Run five seasons" }).then((approved) => { if (approved) void simulateAutonomousSeasons(5); })}><FastForward size={18} /> Run 5 seasons</button>}
          </div>
        </div>
        <CircuitMap circuit={circuit} round={next?.round ?? season.weekends.length} />
      </section>

      <section className="season-rail" aria-label="Season progress">
        <div><small>Season progress</small><strong>{progress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <div><small>Seed</small><strong>{current.baseSeed}</strong></div>
        <div><small>Variance</small><strong>{current.randomness.preset}</strong></div>
        <div><small>Mode</small><strong>{current.mode}</strong></div>
      </section>

      <section className="phase-desk">
        <div className="section-heading"><div><span>Season command</span><h2>Three-phase race control</h2></div><Route /></div>
        <div className="phase-steps" aria-label="Season phase progression">
          <div className={season.phase === "preseason" ? "phase-step phase-step--active" : "phase-step phase-step--done"}><b>01</b><span>Preseason</span><small>Set the grid and rules</small></div>
          <ArrowRight className="phase-arrow" />
          <div className={season.phase === "season-complete" || season.phase === "offseason" ? "phase-step phase-step--done" : season.phase === "between-weekends" || season.phase === "session" ? "phase-step phase-step--active" : "phase-step"}><b>02</b><span>Season</span><small>Run every weekend</small></div>
          <ArrowRight className="phase-arrow" />
          <div className={season.phase === "season-complete" || season.phase === "offseason" ? "phase-step phase-step--active" : "phase-step"}><b>03</b><span>Offseason</span><small>Shape the next campaign</small></div>
        </div>
        {season.phase === "preseason" && <p className="phase-note">The season is staged and waiting. Enter the season when your grid and driver potential are ready.</p>}
        {(season.phase === "between-weekends" || season.phase === "session") && <p className="phase-note">The season is active. Weekend changes are staged at the next legal boundary; the offseason package opens after the final classification.</p>}
        {season.phase === "season-complete" && current.mode === "dynasty" && <p className="phase-note">The final classification is locked. Open the offseason package to review development, rookies, and roster moves before the next season.</p>}
        {season.phase === "offseason" && season.offseasonProposal && <div className="offseason-package"><div><strong>{season.offseasonProposal.targetSeason} package</strong><small>{season.offseasonProposal.summary}</small></div><div className="offseason-changes">{season.offseasonProposal.ratingChanges.map((change) => { const team = season.teams.find((candidate) => candidate.id === change.teamId); return <div className="offseason-change" key={`${change.teamId}-${change.field}`}><span>{team?.shortName ?? change.teamId} · {change.field}</span><div><button aria-label={`Decrease ${change.field} for ${team?.name ?? change.teamId}`} onClick={() => void editOffseasonRating(change.teamId, change.field, change.delta - 1)}><Minus size={13} /></button><b>{change.delta > 0 ? `+${change.delta}` : change.delta}</b><button aria-label={`Increase ${change.field} for ${team?.name ?? change.teamId}`} onClick={() => void editOffseasonRating(change.teamId, change.field, change.delta + 1)}><Plus size={13} /></button></div></div>; })}</div><small className="phase-note">Adjust each proposed team change before accepting. The package is applied automatically when you accept it.</small></div>}
      </section>

      <div className="command-grid">
        <section className="standings-snapshot">
          <div className="section-heading"><div><span>Championship pulse</span><h2>Drivers</h2></div><button onClick={() => setView("standings")}>Full standings</button></div>
          <div className="podium-list">
            {season.driverStandings.slice(0, 5).map((standing, index) => {
              const driver = season.drivers.find((item) => item.id === standing.driverId);
              const team = season.teams.find((item) => item.driverIds.includes(standing.driverId));
              return <div className="podium-row" key={standing.driverId}><span className="rank">{index + 1}</span><span className="team-stripe" style={{ background: team?.color }} /><strong>{displayName(driver)}</strong><small>{team?.shortName}</small><b>{standing.points}</b><em>pts</em></div>;
            })}
          </div>
          {!leader?.points && <p className="empty-note"><Trophy size={18} /> The championship is level before the opening round.</p>}
        </section>

        <section className="operations-panel">
          <div className="section-heading"><div><span>Operations</span><h2>Season desk</h2></div></div>
          <button onClick={() => setView("garage")}><Route /><span><strong>Inspect the grid</strong><small>Edit ratings and entries before the lights go out.</small></span></button>
          <button onClick={() => void refreshData()}><RefreshCw /><span><strong>Refresh current source</strong><small>Create a dated Jolpica snapshot without touching this universe.</small></span></button>
          <button disabled={season.phase === "session"} onClick={() => void branch()}><GitFork /><span><strong>Branch this universe</strong><small>Explore another future from this completed-weekend boundary.</small></span></button>
          <button onClick={exportCurrent}><Download /><span><strong>Export backup</strong><small>Save the full seed, audit history, events, and narrative versions.</small></span></button>
        </section>
      </div>

      <section className="race-log-strip">
        <div><Flag /><span><strong>{completed}</strong> weekends finalized</span></div>
        <div><Sparkles /><span><strong>{current.narratives.filter((item) => item.status === "complete").length}</strong> narrative reports</span></div>
        <div><Trophy /><span><strong>{leaderDriver ? leaderDriver.code : "—"}</strong> championship leader</span></div>
      </section>
    </div>
  );
}

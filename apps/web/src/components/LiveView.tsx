import { useMemo, useState } from "react";
import { AlertTriangle, ChevronsRight, CloudRain, Flag, Gauge, Radio, ShieldAlert, TimerReset } from "lucide-react";
import type { InterventionKind, TireCompound, Weather } from "@f1-sim/core";
import { useSimulator } from "../simulator-context";
import { displayName, formatGap } from "../format";

export function LiveView() {
  const { current, beginWeekend, advance, finish, finalize, intervene, confirm, setView } = useSimulator();
  const [showEveryLap, setShowEveryLap] = useState(false);
  const [driverId, setDriverId] = useState<string>();
  const [weather, setWeather] = useState<Weather>("rain");
  const [tire, setTire] = useState<TireCompound>("intermediate");
  if (!current) return null;
  const weekendState = current.season.currentWeekend;
  const next = current.season.weekends[current.season.currentRoundIndex];

  if (!weekendState) {
    return <div className="empty-state live-empty"><div className="empty-glyph"><Radio /></div><h1>{next ? "Pit wall is standing by" : "Season complete"}</h1><p>{next ? `${next.name} is next. Starting locks the rules and driver base ratings for this season.` : "There are no more weekends on the calendar."}</p>{next && current.season.phase !== "preseason" && <button className="button button--signal" onClick={() => void beginWeekend()}><Flag /> Start {next.name}</button>}{next && current.season.phase === "preseason" && <button className="button button--signal" onClick={() => setView("command")}><Flag /> Enter season command</button>}</div>;
  }

  const session = weekendState.race;
  const selectedDriverId = driverId ?? session.cars[0]?.driverId;
  const circuit = current.season.circuits.find((item) => item.id === weekendState.weekend.circuitId);
  const visibleEvents = session.events.filter((item) => showEveryLap || item.severity !== "routine").slice().reverse();
  const confirmIntervention = (kind: InterventionKind, value: string | number | undefined, note: string, needsDriver = true) => {
    const driver = current.season.drivers.find((item) => item.id === selectedDriverId);
    const target = needsDriver ? displayName(driver) : "the session";
    void confirm({ title: `Commit this change to ${target}?`, message: `${note} There is no live-session undo.`, confirmLabel: "Commit intervention", danger: true }).then((approved) => { if (approved) void intervene(kind, needsDriver ? selectedDriverId : undefined, value, note); });
  };

  return (
    <div className="live-workspace">
      <header className="live-header">
        <div><span className="live-indicator"><i /> Live simulation</span><h1>{weekendState.weekend.name}</h1><p>{circuit?.name} · Lap {session.lap} / {session.totalLaps}</p></div>
        <div className="session-weather"><CloudRain /><span><small>Track condition</small><strong>{session.weather}</strong></span></div>
        <div className="lap-progress"><span style={{ width: `${(session.lap / session.totalLaps) * 100}%` }} /></div>
      </header>

      <div className="live-columns">
        <section className="timing-tower" aria-label="Live timing order">
          <header><span>Pos</span><span>Driver</span><span>Gap</span><span>Tire</span></header>
          <div className="timing-scroll">
            {session.cars.map((car, index) => {
              const driver = current.season.drivers.find((item) => item.id === car.driverId);
              const team = current.season.teams.find((item) => item.id === car.teamId);
              const tireInitial = car.tire.slice(0, 1).toUpperCase();
              return <button key={car.driverId} className={`timing-row ${selectedDriverId === car.driverId ? "timing-row--selected" : ""} ${car.status !== "running" && car.status !== "finished" ? "timing-row--out" : ""}`} onClick={() => setDriverId(car.driverId)}>
                <b style={{ color: team?.color }}>{car.position}</b><span className="timing-driver" style={{ borderLeftColor: team?.color }}><strong>{driver?.code}</strong><small>{driver?.familyName}</small></span><span>{car.status === "dnf" ? "OUT" : formatGap(car.gapMs, index === 0)}</span><span className={`tire tire--${tireInitial.toLowerCase()}`}>{tireInitial}<small>{car.tireAge}</small></span>
              </button>;
            })}
          </div>
        </section>

        <section className="race-ribbon">
          <div className="ribbon-heading"><div><span>Race story</span><h2>The unfolding order</h2></div><label className="switch"><input type="checkbox" checked={showEveryLap} onChange={(event) => setShowEveryLap(event.target.checked)} /><span /> Every lap</label></div>
          <div className="story-stream">
            {visibleEvents.map((item) => <article key={item.id} className={`story-event story-event--${item.severity}`}><div className="event-lap">L{item.lap}</div><div><strong>{item.type.replaceAll("-", " ")}</strong><p>{item.message}</p>{item.factors && <details><summary>Factor breakdown</summary><div className="factor-grid">{Object.entries(item.factors).map(([key, value]) => <span key={key}><small>{key}</small><b>{Math.round(value)}</b></span>)}</div></details>}</div></article>)}
            {visibleEvents.length === 0 && <p className="empty-note">Timing is live. Meaningful moments will appear here.</p>}
          </div>
        </section>

        <aside className="control-desk">
          <div className="control-block">
            <span>Playback</span>
            <div className="control-buttons">
              <button disabled={session.status === "complete"} onClick={() => void advance(1)}><Gauge /> One lap</button>
              <button disabled={session.status === "complete"} onClick={() => void advance(5)}><ChevronsRight /> Five laps</button>
              <button disabled={session.status === "complete"} onClick={() => void finish()}><Flag /> To flag</button>
            </div>
            {session.status === "complete" && <button className="button button--signal button--full" onClick={() => void finalize()}>Finalize result</button>}
          </div>

          <div className="control-block control-block--danger">
            <div className="control-title"><span>Sandbox control</span><ShieldAlert /></div>
            <p>Every confirmed action is permanent and enters the audit log.</p>
            <label>Target driver<select value={selectedDriverId} onChange={(event) => setDriverId(event.target.value)}>{session.cars.map((car) => { const driver = current.season.drivers.find((item) => item.id === car.driverId); return <option key={car.driverId} value={car.driverId}>{driver?.code} · {driver?.familyName}</option>; })}</select></label>
            <div className="inline-control"><select value={weather} onChange={(event) => setWeather(event.target.value as Weather)}>{["clear", "cloudy", "drizzle", "rain", "storm"].map((item) => <option key={item}>{item}</option>)}</select><button onClick={() => confirmIntervention("set-weather", weather, `Set weather to ${weather}.`, false)}>Set weather</button></div>
            <div className="inline-control"><select value={tire} onChange={(event) => setTire(event.target.value as TireCompound)}>{["soft", "medium", "hard", "intermediate", "wet"].map((item) => <option key={item}>{item}</option>)}</select><button onClick={() => confirmIntervention("set-tire", tire, `Fit ${tire} tires.`)}>Fit tire</button></div>
            <button onClick={() => confirmIntervention("force-pit", undefined, "Force a pit stop on the next timing update.")}><TimerReset /> Force pit stop</button>
            <button onClick={() => confirmIntervention("add-penalty", 5, "Apply a five-second time penalty.")}><AlertTriangle /> Add 5s penalty</button>
            <button onClick={() => confirmIntervention("deploy-safety-car", 3, "Deploy the safety car for three laps.", false)}><Radio /> Deploy safety car</button>
            <button className="retire-button" onClick={() => confirmIntervention("retire-driver", undefined, "Retire the selected car by race-control order.")}><ShieldAlert /> Retire selected car</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

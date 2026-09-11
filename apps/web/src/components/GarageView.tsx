import { useMemo, useState } from "react";
import { AlertCircle, Plus, ShieldCheck, Trash2, Wrench } from "lucide-react";
import type { DriverRatings, TeamRatings, WorkshopEdits } from "@f1-sim/core";
import { sentence } from "../format";
import { useSimulator } from "../simulator-context";

const driverFields: Array<keyof DriverRatings> = ["qualifyingPace", "racePace", "tireManagement", "overtaking", "defending", "braking", "cornering", "wetWeather", "consistency", "experience"];
const teamFields: Array<keyof TeamRatings> = ["power", "aerodynamics", "mechanicalGrip", "tirePreservation", "reliability", "pitCrew", "strategy", "developmentPotential"];

function contrastText(hex: string): "#111820" | "#ffffff" {
  const value = hex.replace("#", "");
  if (value.length !== 6) return "#ffffff";
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const luminance = (r * 299 + g * 587 + b * 114) / 1000;
  return luminance >= 150 ? "#111820" : "#ffffff";
}

function RatingControl({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange(value: number): void }) {
  return <label className="rating-control"><span>{sentence(label)}<strong>{value}</strong></span><input type="range" min="0" max="100" value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function GarageView() {
  const { current, addTeam, removeTeam, applyWorkshopEdits } = useSimulator();
  const [driverDraft, setDriverDraft] = useState<Record<string, Partial<DriverRatings>>>({});
  const [teamDraft, setTeamDraft] = useState<Record<string, Partial<TeamRatings>>>({});
  const [teamId, setTeamId] = useState(current?.season.teams[0]?.id);
  const team = current?.season.teams.find((item) => item.id === teamId) ?? current?.season.teams[0];
  const [driverId, setDriverId] = useState(team?.driverIds[0]);
  const driver = current?.season.drivers.find((item) => item.id === driverId) ?? current?.season.drivers.find((item) => item.id === team?.driverIds[0]);
  const activeIds = useMemo(() => new Set(current?.season.teams.flatMap((item) => item.driverIds) ?? []), [current]);
  if (!current || !team || !driver) return null;
  const driverLocked = current.season.rulesLocked;
  const teamLocked = current.season.phase === "session" || current.season.phase === "season-complete";
  const pendingCount = Object.values(driverDraft).reduce((total, values) => total + Object.keys(values).length, 0)
    + Object.values(teamDraft).reduce((total, values) => total + Object.keys(values).length, 0);
  const workshopEdits: WorkshopEdits = { drivers: driverDraft, teams: teamDraft };
  const applyChanges = async () => {
    if (pendingCount === 0) return;
    if (await applyWorkshopEdits(workshopEdits)) {
      setDriverDraft({});
      setTeamDraft({});
    }
  };

  return (
    <div className="page-stack">
      <header className="page-heading"><span>Grid workshop</span><h1>Machines and people</h1><p>Preset evidence stays visible. Changes apply only to this universe and enter its audit history.</p></header>
      <div className="garage-toolbar">
        <label>Constructor<select value={team.id} onChange={(event) => { setTeamId(event.target.value); const selected = current.season.teams.find((item) => item.id === event.target.value); setDriverId(selected?.driverIds[0]); }}>{current.season.teams.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <div className="team-identity"><i style={{ background: team.color }} /><strong>{team.name}</strong><span>{team.shortName}</span></div>
        <button disabled={!['preseason', 'offseason'].includes(current.season.phase)} onClick={() => { const name = window.prompt("New constructor name"); if (name?.trim()) void addTeam(name.trim()); }}><Plus /> Add team</button>
        <button className="danger-text" disabled={!['preseason', 'offseason'].includes(current.season.phase)} onClick={() => { if (window.confirm(`Withdraw ${team.name}? Its drivers will remain free agents.`)) void removeTeam(team.id); }}><Trash2 /> Withdraw</button>
      </div>

      <section className={`workshop-savebar ${pendingCount > 0 ? "workshop-savebar--pending" : ""}`} aria-live="polite">
        <div><strong>{pendingCount > 0 ? `${pendingCount} pending workshop change${pendingCount === 1 ? "" : "s"}` : "All workshop changes applied"}</strong><small>{pendingCount > 0 ? "Review the staged values, then apply them to this universe." : "Values shown here match the saved universe."}</small></div>
        <div><button className="button button--signal" disabled={pendingCount === 0} onClick={() => void applyChanges()}>Apply changes</button><button className="button button--quiet" disabled={pendingCount === 0} onClick={() => { setDriverDraft({}); setTeamDraft({}); }}>Discard</button></div>
      </section>

      <div className="garage-layout">
        <section className="rating-bay">
          <div className="section-heading"><div><span>Car and operations</span><h2>{team.shortName} performance</h2></div><Wrench /></div>
          <p className="evidence-line"><ShieldCheck /> {team.evidence.method} · {team.evidence.confidence} confidence</p>
          <div className="rating-grid">{teamFields.map((field) => <RatingControl key={field} label={field} value={teamDraft[team.id]?.[field] ?? team.ratings[field]} disabled={teamLocked} onChange={(value) => setTeamDraft((existing) => ({ ...existing, [team.id]: { ...existing[team.id], [field]: value } }))} />)}</div>
          {teamLocked && <p className="lock-note"><AlertCircle /> Team ratings can change only at a stable weekend or offseason boundary.</p>}
        </section>

        <section className="rating-bay">
          <div className="section-heading"><div><span>Driver profile</span><h2>{driver.givenName} {driver.familyName}</h2></div><span className="driver-number" style={{ background: team.color, color: contrastText(team.color) }}>{driver.number}</span></div>
          <div className="seat-tabs">{team.driverIds.map((id, index) => { const person = current.season.drivers.find((item) => item.id === id); return <button className={driver.id === id ? "active" : ""} onClick={() => setDriverId(id)} key={id}>Seat {index + 1}<strong>{person?.code}</strong></button>; })}</div>
          <p className="evidence-line"><ShieldCheck /> {driver.evidence.method} · {driver.evidence.confidence} confidence</p>
          <div className="rating-grid">{driverFields.map((field) => <RatingControl key={field} label={field} value={driverDraft[driver.id]?.[field] ?? driver.ratings[field]} disabled={driverLocked} onChange={(value) => setDriverDraft((existing) => ({ ...existing, [driver.id]: { ...existing[driver.id], [field]: value } }))} />)}</div>
          {driverLocked && <p className="lock-note"><AlertCircle /> Base driver ratings lock at round one. Form, morale, pressure, and transfers may still evolve.</p>}
        </section>
      </div>

      <section className="free-agent-strip"><span>Driver registry</span><strong>{current.season.drivers.length}</strong><small>{activeIds.size} active · {current.season.drivers.length - activeIds.size} free agents or reserves</small></section>
      <section className="rules-ledger"><div className="section-heading"><div><span>Sporting framework</span><h2>{current.season.ruleset.name}</h2></div><span className={current.season.rulesLocked ? "lock-badge" : "open-badge"}>{current.season.rulesLocked ? "Locked" : "Editable preseason"}</span></div><div className="rule-grid"><span><small>Qualifying</small><strong>{current.season.ruleset.qualifyingFormat}</strong></span><span><small>Refueling</small><strong>{current.season.ruleset.refueling ? "Available" : "Prohibited"}</strong></span><span><small>Tire rule</small><strong>{current.season.ruleset.tireChanges}</strong></span><span><small>Constructors’ title</small><strong>{current.season.ruleset.constructorsChampionship ? "Awarded" : "Not awarded"}</strong></span></div></section>
    </div>
  );
}

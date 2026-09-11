import { AlertOctagon, Archive, Download, FileClock, Flag, Trash2 } from "lucide-react";
import type { SeasonArchive } from "@f1-sim/core";
import { displayName, formatGap } from "../format";
import { useSimulator } from "../simulator-context";

function statusLabel(status: string, reason?: string): string {
  if (status === "finished") return "Finished";
  if (status === "dnf") return reason ? `DNF · ${reason}` : "DNF";
  return status.toUpperCase();
}

function positionClass(position: number): string {
  if (position === 1) return "result-position result-position--gold";
  if (position === 2) return "result-position result-position--silver";
  if (position === 3) return "result-position result-position--bronze";
  return "result-position";
}

type HistorySeason = Pick<SeasonArchive, "year" | "drivers" | "teams" | "completedWeekends" | "driverStandings">;

function SeasonBreakdown({ data, label }: { data: HistorySeason; label: string }) {
  const validWeekends = data.completedWeekends.filter((item) => !item.voided);
  const allDrivers = [...data.drivers].sort((a, b) => {
    const aPoints = data.driverStandings.find((standing) => standing.driverId === a.id)?.points ?? 0;
    const bPoints = data.driverStandings.find((standing) => standing.driverId === b.id)?.points ?? 0;
    return bPoints - aPoints || a.familyName.localeCompare(b.familyName);
  });
  const teamFor = (driverId: string) => data.teams.find((team) => team.driverIds.includes(driverId));
  const resultFor = (weekend: typeof data.completedWeekends[number], driverId: string) => weekend.race.find((entry) => entry.driverId === driverId);
  return <section className="season-history">
    <div className="section-heading"><div><span>{label}</span><h2>{data.year} winners and finishing order</h2></div><Flag /></div>
    {validWeekends.length === 0 ? <p className="empty-note">Finish a race to start the season history.</p> : <div className="winner-strip">{validWeekends.map((weekend) => { const winner = weekend.race[0]; const driver = data.drivers.find((item) => item.id === winner?.driverId); const team = winner ? teamFor(winner.driverId) : undefined; return <div key={weekend.weekend.id}><span>R{weekend.weekend.round}</span><strong>{driver ? displayName(driver) : "No winner"}</strong><small>{team?.shortName ?? ""} · {weekend.weekend.name}</small></div>; })}</div>}
    {validWeekends.length > 0 && <div className="history-matrix-wrap"><div className="history-matrix-caption"><strong>Driver race-by-race finishes</strong><small>— means the driver did not start or was not classified in that weekend.</small></div><table className="history-matrix"><thead><tr><th>Driver</th>{validWeekends.map((weekend) => <th key={weekend.weekend.id}>R{weekend.weekend.round}<small>{weekend.weekend.name}</small></th>)}</tr></thead><tbody>{allDrivers.map((driver) => <tr key={driver.id}><th><span>{driver.code}</span>{displayName(driver)}</th>{validWeekends.map((weekend) => { const result = resultFor(weekend, driver.id); return <td key={weekend.weekend.id} className={result?.status !== "finished" ? "result-muted" : ""}>{result ? <><b className={positionClass(result.position)}>{result.position}</b><small>{result.status === "finished" ? `${result.points} pts` : statusLabel(result.status)}</small></> : "—"}</td>; })}</tr>)}</tbody></table></div>}
    <section className="race-archive"><div className="section-heading"><div><span>Weekend ledger</span><h3>Race breakdowns</h3></div><Archive /></div>{data.completedWeekends.slice().reverse().map((weekend) => { const winner = weekend.race[0]; const driver = data.drivers.find((item) => item.id === winner?.driverId); return <details key={`${weekend.weekend.id}-${weekend.finalizedAt}`} className={`race-history ${weekend.voided ? "voided" : ""}`}><summary><span>R{weekend.weekend.round}</span><div><strong>{weekend.weekend.name}</strong><small>{weekend.voided ? "Voided result retained" : `${displayName(driver)} · ${winner?.points ?? 0} points`}</small></div><time>{new Date(weekend.finalizedAt).toLocaleDateString()}</time></summary><div className="race-result-scroll"><table className="race-result-table"><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Gap</th><th>Status</th><th>Points</th></tr></thead><tbody>{weekend.race.map((result) => { const person = data.drivers.find((item) => item.id === result.driverId); const team = data.teams.find((item) => item.id === result.teamId); return <tr key={result.driverId}><td><b className={positionClass(result.position)}>{result.position}</b><small>grid {result.grid}</small></td><td>{displayName(person)}</td><td><span className="team-dot" style={{ background: team?.color }} />{team?.shortName ?? result.teamId}</td><td>{formatGap(result.gapMs, result.position === 1)}</td><td><span className={`result-status result-status--${result.status}`}>{statusLabel(result.status, result.reason)}</span></td><td>{result.points}</td></tr>; })}</tbody></table></div></details>; })}</section>
  </section>;
}

export function ArchiveView() {
  const { current, voidLast, exportCurrent, removeCurrent } = useSimulator();
  if (!current) return null;
  const season = current.season;
  const archivedSeasons: HistorySeason[] = (current.seasonHistory ?? []).slice().sort((a, b) => b.year - a.year);
  const currentHistory: HistorySeason = {
    year: season.year,
    drivers: season.drivers,
    teams: season.teams,
    completedWeekends: season.completedWeekends,
    driverStandings: season.driverStandings,
  };
  return <div className="page-stack">
    <header className="page-heading"><span>Immutable record</span><h1>History and audit</h1><p>Open any season and race for its complete classification, gaps, and status. Voided results remain visible so every correction has a trace.</p></header>
    <div className="archive-actions"><button className="button button--dark" onClick={exportCurrent}><Download /> Export full backup</button><button disabled={season.phase === "session" || season.completedWeekends.every((item) => item.voided)} onClick={() => { if (window.confirm("Void the latest finalized weekend and start its rerun? The original will remain in history.")) void voidLast(); }}><AlertOctagon /> Void latest result</button><button className="danger-text" onClick={() => { if (window.confirm(`Permanently remove ${current.name} from this browser? Export first if you may want it later.`)) void removeCurrent(); }}><Trash2 /> Remove universe</button></div>
    <div className="archive-layout"><div className="history-seasons"><SeasonBreakdown data={currentHistory} label="Current universe season" />{archivedSeasons.map((archived) => <SeasonBreakdown key={archived.year} data={archived} label="Archived dynasty season" />)}</div><section className="audit-stream"><div className="section-heading"><div><span>Action trail</span><h2>{current.audit.length} committed actions</h2></div><FileClock /></div>{current.audit.slice().reverse().map((entry) => <article key={entry.id}><i /><div><strong>{entry.action.replaceAll("-", " ")}</strong><p>{entry.summary}</p><time>{new Date(entry.at).toLocaleString()}</time></div></article>)}</section></div>
  </div>;
}

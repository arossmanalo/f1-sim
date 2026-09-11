import { AlertOctagon, Archive, Download, FileClock, Trash2 } from "lucide-react";
import { displayName } from "../format";
import { useSimulator } from "../simulator-context";

export function ArchiveView() {
  const { current, voidLast, exportCurrent, removeCurrent } = useSimulator();
  if (!current) return null;
  const season = current.season;
  return <div className="page-stack">
    <header className="page-heading"><span>Immutable record</span><h1>History and audit</h1><p>Finalized weekends remain visible even when voided. Corrections create a new run from the pre-session boundary.</p></header>
    <div className="archive-actions"><button className="button button--dark" onClick={exportCurrent}><Download /> Export full backup</button><button disabled={season.phase === "session" || season.completedWeekends.every((item) => item.voided)} onClick={() => { if (window.confirm("Void the latest finalized weekend and start its rerun? The original will remain in history.")) void voidLast(); }}><AlertOctagon /> Void latest result</button><button className="danger-text" onClick={() => { if (window.confirm(`Permanently remove ${current.name} from this browser? Export first if you may want it later.`)) void removeCurrent(); }}><Trash2 /> Remove universe</button></div>
    <div className="archive-layout">
      <section className="race-archive"><div className="section-heading"><div><span>Weekend ledger</span><h2>Finalized results</h2></div><Archive /></div>{season.completedWeekends.slice().reverse().map((weekend) => { const winner = weekend.race[0]; const driver = season.drivers.find((item) => item.id === winner?.driverId); return <article key={`${weekend.weekend.id}-${weekend.finalizedAt}`} className={weekend.voided ? "voided" : ""}><span>R{weekend.weekend.round}</span><div><strong>{weekend.weekend.name}</strong><small>{weekend.voided ? "Voided result retained" : `${displayName(driver)} · ${winner?.points ?? 0} points`}</small></div><time>{new Date(weekend.finalizedAt).toLocaleDateString()}</time></article>; })}{season.completedWeekends.length === 0 && <p className="empty-note">No weekend has been finalized.</p>}</section>
      <section className="audit-stream"><div className="section-heading"><div><span>Action trail</span><h2>{current.audit.length} committed actions</h2></div><FileClock /></div>{current.audit.slice().reverse().map((entry) => <article key={entry.id}><i /><div><strong>{entry.action.replaceAll("-", " ")}</strong><p>{entry.summary}</p><time>{new Date(entry.at).toLocaleString()}</time></div></article>)}</section>
    </div>
  </div>;
}

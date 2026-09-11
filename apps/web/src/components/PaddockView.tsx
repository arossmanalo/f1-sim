import { useState } from "react";
import { Bot, Check, CloudOff, Edit3, RefreshCw, Sparkles } from "lucide-react";
import type { NarrativeVersion } from "@f1-sim/core";
import { useSimulator } from "../simulator-context";

function Story({ narrative, onSave }: { narrative: NarrativeVersion; onSave(id: string, text: string): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(narrative.text);
  return <article className={`narrative-card narrative-card--${narrative.status}`}>
    <header><span>{narrative.scope}</span><small>{new Date(narrative.createdAt).toLocaleString()}</small><em>{narrative.provider} · {narrative.model}</em></header>
    {editing ? <textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} /> : <div className="prose">{narrative.text.split("\n").filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
    <footer>{narrative.status === "queued" ? <span><CloudOff /> Queued for retry</span> : <span><Check /> Stored version</span>}<button onClick={() => { if (editing) void onSave(narrative.id, text).then(() => setEditing(false)); else setEditing(true); }}>{editing ? <><Check /> Save revision</> : <><Edit3 /> Edit copy</>}</button></footer>
  </article>;
}

export function PaddockView() {
  const { current, narrate, editNarrative, health, narrationStatus } = useSimulator();
  if (!current) return null;
  const isNarrating = narrationStatus !== "idle";
  const statusTitle = narrationStatus === "preparing" ? "Constructing the season prompt…" : "Gemini is writing the season story…";
  const statusDetail = narrationStatus === "preparing" ? "Collecting verified race facts, rivalries, team drama, and development arcs." : "The local service is waiting for Gemini to finish; this can take a little while.";
  return <div className="page-stack paddock-page">
    <header className="page-heading paddock-heading"><span>Paddock wire</span><h1>The season beyond the stopwatch</h1><p>Gemini is given the season arc, rivalries, team development, rookie paths, and verified events so each report continues a story. Generated words are archived; race facts stay untouchable.</p><button className="button button--signal" disabled={isNarrating} aria-busy={isNarrating} onClick={() => void narrate()}><Sparkles className={isNarrating ? "narration-spin" : undefined} /> {isNarrating ? "Preparing story…" : "File a new report"}</button></header>
    <div className={`provider-banner ${health?.narration.available ? "provider-banner--ready" : "provider-banner--off"}`}><Bot /><span><strong>{health?.narration.available ? "Gemini newsroom connected" : "AI narration unavailable"}</strong><small>{health?.narration.available ? `Using ${health.narration.model}${health.narration.fallbackModel ? `; fallback ${health.narration.fallbackModel} is used during model load.` : ""}. Major moments are batched to preserve quota.` : "Simulation continues. Factual summaries remain visible and prose is queued."}</small></span><RefreshCw /></div>
    {isNarrating && <div className="narration-progress" role="status" aria-live="polite"><span className="narration-progress__lamp narration-spin" /><span><strong>{statusTitle}</strong><small>{statusDetail}</small></span></div>}
    <section className="narrative-feed">
      {current.narratives.slice().reverse().map((narrative) => <Story narrative={narrative} key={narrative.id} onSave={editNarrative} />)}
      {current.narratives.length === 0 && <div className="empty-state"><div className="empty-glyph"><Bot /></div><h2>No reports filed yet</h2><p>Run a race or begin the season, then ask the newsroom to turn its major moments into a stored narrative.</p></div>}
    </section>
  </div>;
}

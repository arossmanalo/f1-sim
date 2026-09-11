import { useState } from "react";
import {
  Activity,
  Archive,
  BookOpenText,
  ChevronDown,
  CircleGauge,
  CloudOff,
  DatabaseZap,
  Flag,
  Gauge,
  GitFork,
  Menu,
  Radio,
  Settings2,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useSimulator, type AppView } from "./simulator-context";
import { SeasonSetup } from "./components/SeasonSetup";
import { CommandView } from "./components/CommandView";
import { LiveView } from "./components/LiveView";
import { StandingsView } from "./components/StandingsView";
import { GarageView } from "./components/GarageView";
import { MarketView } from "./components/MarketView";
import { PaddockView } from "./components/PaddockView";
import { ArchiveView } from "./components/ArchiveView";
import { CompareView } from "./components/CompareView";

const navigation: Array<{ id: AppView; label: string; icon: typeof Gauge }> = [
  { id: "command", label: "Season command", icon: CircleGauge },
  { id: "live", label: "Live weekend", icon: Radio },
  { id: "standings", label: "Standings", icon: Trophy },
  { id: "garage", label: "Grid workshop", icon: Settings2 },
  { id: "market", label: "Driver market", icon: Users },
  { id: "paddock", label: "Paddock feed", icon: BookOpenText },
  { id: "archive", label: "History & audit", icon: Archive },
  { id: "compare", label: "Compare reality", icon: GitFork },
];

export function App() {
  const { loading, current, universes, view, setView, selectUniverse, health, notice } = useSimulator();
  const [newOpen, setNewOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) return <div className="boot-screen"><img className="boot-mark" src="/f1-logo.png" alt="Formula 1" /><p>Preparing race control…</p></div>;
  if (!current) return <main className="empty-app"><SeasonSetup /></main>;

  const View = {
    command: CommandView,
    live: LiveView,
    standings: StandingsView,
    garage: GarageView,
    market: MarketView,
    paddock: PaddockView,
    archive: ArchiveView,
    compare: CompareView,
  }[view];

  return (
    <div className={`app-shell ${menuOpen ? "app-shell--menu" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><img className="brand-mark" src="/f1-logo.png" alt="Formula 1" /><span><strong>F1 SIM</strong><small>Race control</small></span></div>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={view === item.id ? "nav-item nav-item--active" : "nav-item"} onClick={() => { setView(item.id); setMenuOpen(false); }}><Icon size={18} /><span>{item.label}</span></button>;
          })}
        </nav>
        <div className="sidebar-status">
          <span className={`status-lamp ${health?.narration.available ? "status-lamp--ready" : "status-lamp--off"}`} />
          <div><strong>{health?.narration.available ? "Gemini ready" : "Narration offline"}</strong><small>{health?.narration.available ? `${health.narration.model}${health.narration.fallbackModel ? ` · fallback ${health.narration.fallbackModel}` : ""}` : "Simulation unaffected"}</small></div>
        </div>
        <button className="new-universe" onClick={() => setNewOpen(true)}>New universe</button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
          <div className="universe-picker">
            <Flag size={17} />
            <select value={current.id} onChange={(event) => selectUniverse(event.target.value)} aria-label="Active universe">
              {universes.map((universe) => <option value={universe.id} key={universe.id}>{universe.name}</option>)}
            </select>
            <ChevronDown size={14} />
          </div>
          <div className="topbar-meta"><span>{current.season.year}</span><span>Round {Math.min(current.season.currentRoundIndex + 1, current.season.weekends.length)} / {current.season.weekends.length}</span><span className="autosave"><ShieldCheck size={15} /> Autosaved</span></div>
        </header>
        {notice && <div className={`notice notice--${notice.tone}`}>{notice.tone === "error" ? <CloudOff size={17} /> : <Activity size={17} />}{notice.text}</div>}
        <main className={`main-view main-view--${view}`}><View /></main>
      </div>

      {newOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create a universe"><div className="modal-sheet"><button className="modal-close" aria-label="Close" onClick={() => setNewOpen(false)}><X /></button><SeasonSetup compact onDone={() => setNewOpen(false)} /></div></div>}
    </div>
  );
}

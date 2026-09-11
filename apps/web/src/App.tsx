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
  Home,
  Medal,
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
import { HomeView } from "./components/HomeView";
import { RecordsView } from "./components/RecordsView";
import { ConfirmDialog } from "./components/ConfirmDialog";

const navigation: Array<{ id: AppView; label: string; icon: typeof Gauge }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "command", label: "Season command", icon: CircleGauge },
  { id: "live", label: "Live weekend", icon: Radio },
  { id: "standings", label: "Standings", icon: Trophy },
  { id: "garage", label: "Grid workshop", icon: Settings2 },
  { id: "market", label: "Driver market", icon: Users },
  { id: "paddock", label: "Paddock feed", icon: BookOpenText },
  { id: "archive", label: "History & audit", icon: Archive },
  { id: "records", label: "Records", icon: Medal },
  { id: "compare", label: "Compare reality", icon: GitFork },
];

export function App() {
  const { loading, current, universes, view, setView, selectUniverse, health, notice, confirmation, resolveConfirmation } = useSimulator();
  const [newOpen, setNewOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) return <div className="boot-screen"><img className="boot-mark" src="/f1-logo.png" alt="Formula 1" /><p>Preparing race control…</p></div>;
  if (!current) return <><main className="empty-app"><HomeView onNew={() => setNewOpen(true)} /></main>{newOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create a universe"><div className="modal-sheet"><button className="modal-close" aria-label="Close" onClick={() => setNewOpen(false)}><X /></button><SeasonSetup compact onDone={() => setNewOpen(false)} /></div></div>}<ConfirmDialog prompt={confirmation} onConfirm={() => resolveConfirmation(true)} onCancel={() => resolveConfirmation(false)} /></>;

  const View = {
    home: HomeView,
    command: CommandView,
    live: LiveView,
    standings: StandingsView,
    garage: GarageView,
    market: MarketView,
    paddock: PaddockView,
    archive: ArchiveView,
    records: RecordsView,
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
        <main className={`main-view main-view--${view}`}><View {...(view === "home" ? { onNew: () => setNewOpen(true) } : {})} /></main>
      </div>

      {newOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create a universe"><div className="modal-sheet"><button className="modal-close" aria-label="Close" onClick={() => setNewOpen(false)}><X /></button><SeasonSetup compact onDone={() => setNewOpen(false)} /></div></div>}
      <ConfirmDialog prompt={confirmation} onConfirm={() => resolveConfirmation(true)} onCancel={() => resolveConfirmation(false)} />
    </div>
  );
}

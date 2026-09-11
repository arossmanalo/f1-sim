import { useMemo, useState } from "react";
import { Database, Flag, Gauge, Upload } from "lucide-react";
import type { RandomnessSettings, SeasonPreset, UniverseMode } from "@f1-sim/core";
import { useSimulator } from "../simulator-context";

export function SeasonSetup({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const { presets, create, importBackup } = useSimulator();
  const [presetId, setPresetId] = useState(presets.at(-1)?.id ?? presets[0]!.id);
  const preset = useMemo(() => presets.find((candidate) => candidate.id === presetId)!, [presetId, presets]);
  const [name, setName] = useState(`${preset.year} alternate season`);
  const [mode, setMode] = useState<UniverseMode>("dynasty");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [randomness, setRandomness] = useState<RandomnessSettings["preset"]>("realistic");

  const selectPreset = (value: string) => {
    setPresetId(value);
    const selected = presets.find((candidate) => candidate.id === value);
    if (selected) setName(`${selected.year} alternate season`);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await create({ preset, name: name.trim() || `${preset.year} season`, mode, seed, randomness: { preset: randomness } });
    onDone?.();
  };

  return (
    <section className={`season-setup ${compact ? "season-setup--compact" : ""}`}>
      <div className="setup-intro">
        <img className="setup-logo" src="/f1-logo.png" alt="Formula 1" />
        <span className="signal-chip"><Flag size={15} /> New universe</span>
        <h1>Choose the grid. Rewrite the season.</h1>
        <p>Every built-in season is an immutable source. Your changes live in a separate, replayable universe.</p>
      </div>
      <form className="setup-form" onSubmit={submit}>
        <label>
          Source season
          <select value={presetId} onChange={(event) => selectPreset(event.target.value)}>
            {presets.map((item) => <option key={item.id} value={item.id}>{item.year} · {item.name}</option>)}
          </select>
        </label>
        <label>
          Universe name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
        </label>
        <div className="setup-pair">
          <label>
            Mode
            <select value={mode} onChange={(event) => setMode(event.target.value as UniverseMode)}>
              <option value="dynasty">Persistent dynasty</option>
              <option value="standalone">Standalone season</option>
            </select>
          </label>
          <label>
            Variance
            <select value={randomness} onChange={(event) => setRandomness(event.target.value as RandomnessSettings["preset"])}>
              <option value="stable">Stable</option>
              <option value="realistic">Realistic</option>
              <option value="chaotic">Chaotic</option>
            </select>
          </label>
        </div>
        <label>
          Replay seed
          <input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
        </label>
        <div className="source-strip">
          <Database size={17} />
          <span>{preset.teams.length} teams · {preset.drivers.length} drivers · {preset.weekends.length} rounds</span>
          <strong>{preset.sourceNote}</strong>
        </div>
        <button className="button button--primary" type="submit"><Gauge size={18} /> Create universe</button>
        <label className="button button--quiet file-button">
          <Upload size={17} /> Import backup
          <input type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importBackup(file).then(onDone);
          }} />
        </label>
      </form>
    </section>
  );
}

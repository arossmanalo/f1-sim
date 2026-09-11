import {
  BUILT_IN_PRESETS,
  addCustomTeam,
  appendNarrative,
  applyIntervention,
  approveOffseason,
  createUniverse,
  exportUniverse,
  fastForwardSeason,
  finalizeWeekend,
  finishSession,
  forkUniverse,
  importUniverse,
  moveDriver,
  proposeOffseason,
  removeTeam,
  reviseNarrative,
  startWeekend,
  updateDriverRating,
  updateTeamRating,
  voidLastWeekend,
  advanceLaps,
  applyWorkshopEdits,
  type DriverRatings,
  type Driver,
  type InterventionKind,
  type NarrativeRequest,
  type NarrativeVersion,
  type RandomnessSettings,
  type SeasonPreset,
  type TeamRatings,
  type Team,
  type Universe,
  type UniverseMode,
  type Weather,
  type WorkshopEdits,
} from "@f1-sim/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { generateNarrative, getHealth, refreshCurrentData, type ServiceHealth } from "./api";
import { db, deleteUniverse, lastUniverseId, loadUniverses, saveUniverse } from "./db";
import { buildNarrativeStoryContext } from "./story-context";

export type AppView = "command" | "live" | "standings" | "garage" | "market" | "paddock" | "archive" | "compare";

interface CreateOptions {
  preset: SeasonPreset;
  name: string;
  mode: UniverseMode;
  seed: number;
  randomness: Partial<RandomnessSettings>;
}

interface SimulatorContextValue {
  loading: boolean;
  universes: Universe[];
  current?: Universe;
  view: AppView;
  health?: ServiceHealth;
  narrationStatus: "idle" | "preparing" | "generating";
  notice?: { tone: "info" | "success" | "error"; text: string };
  presets: SeasonPreset[];
  setView(view: AppView): void;
  selectUniverse(id: string): void;
  create(options: CreateOptions): Promise<void>;
  removeCurrent(): Promise<void>;
  beginWeekend(): Promise<void>;
  advance(laps: number): Promise<void>;
  finish(): Promise<void>;
  finalize(): Promise<void>;
  simulateSeason(): Promise<void>;
  intervene(kind: InterventionKind, driverId: string | undefined, value: string | number | undefined, note: string): Promise<void>;
  branch(): Promise<void>;
  voidLast(): Promise<void>;
  editDriver(driverId: string, field: keyof DriverRatings, value: number): Promise<void>;
  editTeam(teamId: string, field: keyof TeamRatings, value: number): Promise<void>;
  applyWorkshopEdits(edits: WorkshopEdits): Promise<boolean>;
  move(driverId: string, teamId: string, seat: 0 | 1): Promise<void>;
  addTeam(name: string): Promise<void>;
  removeTeam(teamId: string): Promise<void>;
  createOffseason(): Promise<void>;
  acceptOffseason(): Promise<void>;
  narrate(): Promise<void>;
  editNarrative(sourceId: string, text: string): Promise<void>;
  exportCurrent(): void;
  importBackup(file: File): Promise<void>;
  refreshData(): Promise<void>;
}

const SimulatorContext = createContext<SimulatorContextValue | undefined>(undefined);

export function SimulatorProvider({ children }: { children: ReactNode }) {
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [currentId, setCurrentId] = useState<string>();
  const [view, setView] = useState<AppView>("command");
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<ServiceHealth>();
  const [narrationStatus, setNarrationStatus] = useState<"idle" | "preparing" | "generating">("idle");
  const [notice, setNotice] = useState<SimulatorContextValue["notice"]>();
  const current = universes.find((universe) => universe.id === currentId);

  useEffect(() => {
    let active = true;
    Promise.all([loadUniverses(), lastUniverseId(), getHealth().catch(() => undefined)]).then(([stored, lastId, service]) => {
      if (!active) return;
      setUniverses(stored);
      setCurrentId(stored.some((universe) => universe.id === lastId) ? lastId : stored[0]?.id);
      setHealth(service);
      setLoading(false);
    });
    const healthPoll = window.setInterval(() => {
      getHealth().then((service) => {
        if (active) setHealth(service);
      }).catch(() => {
        if (active) setHealth(undefined);
      });
    }, 3_000);
    return () => {
      active = false;
      window.clearInterval(healthPoll);
    };
  }, []);

  const commit = useCallback(async (universe: Universe, message?: string) => {
    await saveUniverse(universe);
    setUniverses((existing) => [universe, ...existing.filter((item) => item.id !== universe.id)]);
    setCurrentId(universe.id);
    if (message) setNotice({ tone: "success", text: message });
  }, []);

  const run = useCallback(async (operation: (universe: Universe) => Universe, message?: string) => {
    if (!current) return;
    try {
      await commit(operation(current), message);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "The operation failed." });
    }
  }, [commit, current]);

  const create = useCallback(async (options: CreateOptions) => {
    const universe = createUniverse(options.preset, options);
    await commit(universe, `${universe.name} is ready in the garage.`);
    setView("command");
  }, [commit]);

  const removeCurrent = useCallback(async () => {
    if (!current) return;
    await deleteUniverse(current.id);
    const remaining = universes.filter((universe) => universe.id !== current.id);
    setUniverses(remaining);
    setCurrentId(remaining[0]?.id);
    setNotice({ tone: "info", text: "Universe removed from this browser." });
  }, [current, universes]);

  const narrate = useCallback(async () => {
    if (!current || narrationStatus !== "idle") return;
    setNarrationStatus("preparing");
    try {
      // Let React paint the preparation state before the synchronous context
      // assembly and network request begin.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
      const active = current.season.currentWeekend;
      const completed = current.season.completedWeekends.filter((weekend) => !weekend.voided).at(-1);
      const sourceEvents = active?.race.events ?? completed?.events ?? [];
      const major = sourceEvents.filter((event) => event.severity !== "routine").slice(-12);
      const scopeId = active?.race.id ?? completed?.weekend.id ?? current.id;
      const title = active?.weekend.name ?? completed?.weekend.name ?? `${current.season.year} paddock`;
      const storyContext = buildNarrativeStoryContext(current);
      const storyFacts = [
        ...storyContext.seasonArc,
        ...storyContext.rivalries.map((rivalry) => `${rivalry.title}: ${rivalry.summary}`),
        ...storyContext.teamDramas.slice(0, 4).map((drama) => `${drama.team}: ${drama.summary}`),
        ...storyContext.upgrades.slice(-4).map((upgrade) => `Round ${upgrade.round} upgrade: ${upgrade.summary}`),
      ];
      const boundedFacts = [...(major.length ? major.map((entry) => entry.message) : ["No competitive session has been completed yet."]), ...storyFacts]
        .map((fact) => fact.length > 400 ? `${fact.slice(0, 397)}...` : fact)
        .slice(0, 40);
      const activeDriverIds = new Set(current.season.teams.flatMap((team) => team.driverIds));
      const narrationDrivers = [...current.season.drivers.filter((driver) => activeDriverIds.has(driver.id)), ...current.season.drivers.filter((driver) => !activeDriverIds.has(driver.id))].slice(0, 50);
      const request: NarrativeRequest = {
        scope: active ? "session" : completed ? "weekend" : "paddock",
        scopeId,
        season: current.season.year,
        title,
        facts: boundedFacts,
        characters: narrationDrivers.map((driver) => {
          const team = current.season.teams.find((candidate) => candidate.driverIds.includes(driver.id));
          return { id: driver.id, name: `${driver.givenName} ${driver.familyName}`, team: team?.name };
        }),
        tone: active ? "live" : completed ? "recap" : "paddock",
        previousContext: current.narratives.filter((item) => item.status === "complete").at(-1)?.text.slice(-2500),
        storyContext,
      };
      setNarrationStatus("generating");
      try {
        const generated = await generateNarrative(request);
        await commit(appendNarrative(current, { ...generated, scope: request.scope, scopeId, status: "complete" }), "Gemini filed a new paddock story.");
      } catch (error) {
        const failed: Omit<NarrativeVersion, "id" | "createdAt"> = {
          scope: request.scope,
          scopeId,
          text: [...major.map((entry) => entry.message), ...storyContext.seasonArc.slice(0, 3)].join(" ") || "Narrative is queued until the local AI service is available.",
          provider: "gemini",
          model: health?.narration.model ?? "configured-gemini-model",
          promptVersion: "narrative-v2",
          status: "queued",
        };
        await commit(appendNarrative(current, failed));
        setNotice({ tone: "error", text: `${error instanceof Error ? error.message : "AI narration unavailable"} Simulation remains available; the story was queued.` });
      }
    } finally {
      setNarrationStatus("idle");
    }
  }, [commit, current, health, narrationStatus]);

  const exportCurrent = useCallback(() => {
    if (!current) return;
    const blob = new Blob([exportUniverse(current)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${current.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.f1sim.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [current]);

  const importBackup = useCallback(async (file: File) => {
    try {
      await commit(importUniverse(await file.text()), "Backup imported without changing its source snapshot.");
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Import failed." });
    }
  }, [commit]);

  const refreshData = useCallback(async () => {
    try {
      const refreshed = await refreshCurrentData();
      await db.snapshots.put({ ...refreshed.snapshot, season: new Date().getFullYear(), note: refreshed.note, payload: refreshed.payload });
      setNotice({ tone: "success", text: "A new immutable Jolpica snapshot was cached. Existing universes were not changed." });
    } catch (error) {
      setNotice({ tone: "error", text: `${error instanceof Error ? error.message : "Refresh failed"} The last good snapshot remains available.` });
    }
  }, []);

  const value = useMemo<SimulatorContextValue>(() => ({
    loading, universes, current, view, health, notice, narrationStatus, presets: BUILT_IN_PRESETS, setView,
    selectUniverse: (id) => { setCurrentId(id); void db.settings.put({ key: "lastUniverseId", value: id }); },
    create, removeCurrent,
    beginWeekend: () => run(startWeekend, "Weekend started. Rules and base driver ratings are now locked."),
    advance: (laps) => run((universe) => advanceLaps(universe, laps)),
    finish: () => run(finishSession, "Chequered flag. Review the result before finalizing."),
    finalize: () => run(finalizeWeekend, "Weekend finalized and standings updated."),
    simulateSeason: () => run(fastForwardSeason, "Season simulated to completion."),
    intervene: (kind, driverId, interventionValue, note) => run((universe) => applyIntervention(universe, { kind, driverId, value: interventionValue, note }), "Intervention committed. It cannot be undone."),
    branch: async () => { if (current) await commit(forkUniverse(current), "A new universe branch was created at this weekend boundary."); },
    voidLast: () => run(voidLastWeekend, "Previous result voided; a deterministic rerun has started."),
    editDriver: (driverId, field, rating) => run((universe) => updateDriverRating(universe, driverId, field, rating)),
    editTeam: (teamId, field, rating) => run((universe) => updateTeamRating(universe, teamId, field, rating)),
    applyWorkshopEdits: async (edits) => {
      if (!current) return false;
      try {
        await commit(applyWorkshopEdits(current, edits), "Workshop changes applied; team changes take effect next weekend.");
        return true;
      } catch (error) {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "The workshop changes could not be applied." });
        return false;
      }
    },
    move: (driverId, teamId, seat) => run((universe) => moveDriver(universe, driverId, teamId, seat), "Driver move scheduled for the next weekend."),
    addTeam: (name) => run((universe) => {
      const stamp = `${Date.now()}`;
      const evidence = { source: "Custom entry", method: "User-created neutral baseline", confidence: "high" as const, updatedAt: new Date().toISOString() };
      const makeDriver = (seat: number): Driver => ({
        id: `custom-driver-${stamp}-${seat}`,
        givenName: "New",
        familyName: `Driver ${seat + 1}`,
        code: `N${seat + 1}`,
        number: 90 + seat,
        nationality: "Custom",
        age: 22,
        ratings: { qualifyingPace: 75, racePace: 75, tireManagement: 75, overtaking: 75, defending: 75, braking: 75, cornering: 75, wetWeather: 75, consistency: 75, experience: 65 },
        potential: 84,
        form: 50,
        morale: 50,
        pressure: 50,
        evidence,
      });
      const drivers: [Driver, Driver] = [makeDriver(0), makeDriver(1)];
      const team: Team = {
        id: `custom-team-${stamp}`,
        name,
        shortName: name.slice(0, 3).toUpperCase(),
        color: "#7f8c96",
        driverIds: [drivers[0].id, drivers[1].id],
        ratings: { power: 72, aerodynamics: 72, mechanicalGrip: 72, tirePreservation: 72, reliability: 72, pitCrew: 72, strategy: 72, developmentPotential: 80 },
        evidence,
      };
      return addCustomTeam(universe, team, drivers);
    }, `${name} entered the championship.`),
    removeTeam: (teamId) => run((universe) => removeTeam(universe, teamId), "Team withdrawn; its drivers remain in the free-agent pool."),
    createOffseason: () => run(proposeOffseason, "Offseason package generated for review."),
    acceptOffseason: () => run(approveOffseason, "Offseason approved; the next season is ready."),
    narrate,
    editNarrative: (sourceId, text) => run((universe) => reviseNarrative(universe, sourceId, text), "Narrative revision stored without changing race facts."),
    exportCurrent, importBackup, refreshData,
  }), [commit, create, current, exportCurrent, health, importBackup, loading, narrate, narrationStatus, notice, removeCurrent, run, universes, view]);

  return <SimulatorContext.Provider value={value}>{children}</SimulatorContext.Provider>;
}

export function useSimulator(): SimulatorContextValue {
  const value = useContext(SimulatorContext);
  if (!value) throw new Error("useSimulator must be used within SimulatorProvider");
  return value;
}

import { DeterministicRng, hashSeed } from "./rng";
import { rebuildStandings } from "./standings";
import type {
  AuditEntry,
  CarState,
  Circuit,
  Driver,
  FactorBreakdown,
  Intervention,
  RaceResultEntry,
  RandomnessSettings,
  SeasonPreset,
  SimulationCommand,
  SimulationEvent,
  Team,
  TireCompound,
  Universe,
  UniverseMode,
  Weather,
  WeekendState,
} from "./types";
import { validatePreset } from "./validation";
import { applyInSeasonDevelopment } from "./progression";
import { normalizeUniverse } from "./migrations";
import { recalculateSeasonPerformance } from "./performance";

const DEFAULT_RANDOMNESS: RandomnessSettings = {
  preset: "realistic",
  paceVariance: 1,
  incidentRate: 1,
  reliabilityVariance: 1,
  weatherVolatility: 1,
  developmentVariance: 1,
};

const WEATHER_SEQUENCE: Weather[] = ["clear", "cloudy", "drizzle", "rain", "storm"];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function uid(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function deterministicTime(year: number, round: number, lap: number, index: number): string {
  return new Date(Date.UTC(year, 0, 1) + round * 86_400_000 + lap * 60_000 + index * 1_000).toISOString();
}

function event(
  universe: Universe,
  type: SimulationEvent["type"],
  message: string,
  lap: number,
  severity: SimulationEvent["severity"] = "routine",
  driverIds: string[] = [],
  teamIds: string[] = [],
  factors?: FactorBreakdown,
): SimulationEvent {
  const session = universe.season.currentWeekend?.race;
  const index = session?.events.length ?? 0;
  return {
    id: `event-${universe.season.year}-${universe.season.currentRoundIndex + 1}-${lap}-${index}`,
    type,
    session: "race",
    lap,
    severity,
    message,
    driverIds,
    teamIds,
    factors,
    createdAt: deterministicTime(universe.season.year, universe.season.currentRoundIndex + 1, lap, index),
  };
}

function getDriver(universe: Universe, id: string): Driver {
  const driver = universe.season.drivers.find((candidate) => candidate.id === id);
  if (!driver) throw new Error(`Unknown driver ${id}`);
  return driver;
}

function getTeam(universe: Universe, id: string): Team {
  const team = universe.season.teams.find((candidate) => candidate.id === id);
  if (!team) throw new Error(`Unknown team ${id}`);
  return team;
}

function getCircuit(universe: Universe, id: string): Circuit {
  const circuit = universe.season.circuits.find((candidate) => candidate.id === id);
  if (!circuit) throw new Error(`Unknown circuit ${id}`);
  return circuit;
}

function dramaModifier(driver: Driver): number {
  return ((driver.form - 50) * 0.025 + (driver.morale - 50) * 0.018 - (driver.pressure - 50) * 0.012);
}

function carPerformance(team: Team, circuit: Circuit): number {
  const profile = circuit.profile;
  const weighted =
    team.ratings.power * profile.power +
    team.ratings.aerodynamics * profile.aero +
    team.ratings.mechanicalGrip * profile.traction +
    team.ratings.mechanicalGrip * profile.braking;
  const totalWeight = profile.power + profile.aero + profile.traction + profile.braking || 1;
  return weighted / totalWeight;
}

function driverPerformance(driver: Driver, circuit: Circuit, weather: Weather, qualifying: boolean): number {
  const wet = weather === "rain" || weather === "storm" || weather === "drizzle";
  if (wet) {
    return driver.ratings.wetWeather * 0.45 + driver.ratings.consistency * 0.2 + driver.ratings.experience * 0.15 + driver.ratings.racePace * 0.2;
  }
  const base = qualifying ? driver.ratings.qualifyingPace : driver.ratings.racePace;
  return (
    base * 0.42 +
    driver.ratings.cornering * (circuit.profile.aero / 400) +
    driver.ratings.braking * (circuit.profile.braking / 400) +
    driver.ratings.consistency * 0.12 +
    driver.ratings.experience * 0.06 +
    (driver.ratings.overtaking + driver.ratings.defending) * 0.1
  );
}

function qualifyingResult(universe: Universe, circuit: Circuit, rng: DeterministicRng): RaceResultEntry[] {
  const entries = universe.season.teams.flatMap((team) => team.driverIds.map((driverId) => ({ team, driver: getDriver(universe, driverId) })));
  return entries
    .map(({ team, driver }) => ({
      driver,
      team,
      score:
        carPerformance(team, circuit) * 0.52 +
        driverPerformance(driver, circuit, "clear", true) * 0.48 +
        dramaModifier(driver) +
        rng.between(-2.4, 2.4) * universe.randomness.paceVariance,
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ driver, team }, index) => ({
      position: index + 1,
      driverId: driver.id,
      teamId: team.id,
      grid: index + 1,
      laps: 0,
      elapsedMs: 0,
      gapMs: 0,
      status: "finished" as const,
      points: 0,
    }));
}

function sprintResult(universe: Universe, qualifying: RaceResultEntry[], circuit: Circuit, rng: DeterministicRng): RaceResultEntry[] {
  return qualifying
    .map((entry) => {
      const driver = getDriver(universe, entry.driverId);
      const team = getTeam(universe, entry.teamId);
      const score = carPerformance(team, circuit) * 0.5 + driverPerformance(driver, circuit, "clear", false) * 0.5 + rng.between(-5, 5);
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ entry }, index) => ({
      ...entry,
      position: index + 1,
      laps: Math.max(1, Math.round(circuit.profile.lapCount / 3)),
      points: universe.season.ruleset.sprintPoints.find((rule) => rule.position === index + 1)?.points ?? 0,
    }));
}

function initialWeather(circuit: Circuit, rng: DeterministicRng): Weather {
  const wetChance = circuit.profile.weatherTendency / 250;
  if (rng.chance(wetChance * 0.2)) return "rain";
  if (rng.chance(wetChance * 0.4)) return "drizzle";
  return rng.chance(0.35) ? "cloudy" : "clear";
}

function buildForecast(circuit: Circuit, rng: DeterministicRng): Weather[] {
  let current = initialWeather(circuit, rng);
  const forecast: Weather[] = [];
  for (let index = 0; index < 8; index += 1) {
    if (rng.chance(circuit.profile.weatherTendency / 260)) {
      const currentIndex = WEATHER_SEQUENCE.indexOf(current);
      current = WEATHER_SEQUENCE[Math.max(0, Math.min(WEATHER_SEQUENCE.length - 1, currentIndex + rng.pick([-1, 1])))]!;
    }
    forecast.push(current);
  }
  return forecast;
}

function createRace(universe: Universe, qualifying: RaceResultEntry[], circuit: Circuit, rng: DeterministicRng) {
  const cars: CarState[] = qualifying.map((entry) => ({
    driverId: entry.driverId,
    teamId: entry.teamId,
    position: entry.position,
    startPosition: entry.position,
    lapsCompleted: 0,
    elapsedMs: 0,
    lastLapMs: 0,
    gapMs: 0,
    tire: "medium",
    tireAge: 0,
    fuel: universe.season.ruleset.refueling ? 58 : 100,
    pitStops: 0,
    penaltyMs: 0,
    status: "running",
  }));
  const weather = initialWeather(circuit, rng);
  return {
    id: `race-${universe.season.year}-${universe.season.currentRoundIndex + 1}-${rng.getState()}`,
    kind: "race" as const,
    status: "running" as const,
    lap: 0,
    totalLaps: circuit.profile.lapCount,
    weather,
    forecast: buildForecast(circuit, rng),
    safetyCarLaps: 0,
    rngState: rng.getState(),
    cars,
    events: [] as SimulationEvent[],
  };
}

function applyRandomnessPreset(settings?: Partial<RandomnessSettings>): RandomnessSettings {
  const merged = { ...DEFAULT_RANDOMNESS, ...settings };
  if (merged.preset === "stable") return { ...merged, paceVariance: 0.55, incidentRate: 0.55, reliabilityVariance: 0.7, weatherVolatility: 0.65, developmentVariance: 0.65 };
  if (merged.preset === "chaotic") return { ...merged, paceVariance: 1.55, incidentRate: 1.65, reliabilityVariance: 1.5, weatherVolatility: 1.5, developmentVariance: 1.4 };
  return merged;
}

export function createUniverse(
  preset: SeasonPreset,
  options: { name?: string; mode?: UniverseMode; seed?: number; randomness?: Partial<RandomnessSettings> } = {},
): Universe {
  const errors = validatePreset(preset);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const now = new Date().toISOString();
  const universe: Universe = {
    schemaVersion: 2,
    id: uid("universe"),
    name: options.name ?? `${preset.year} alternate season`,
    mode: options.mode ?? "standalone",
    createdAt: now,
    updatedAt: now,
    baseSeed: options.seed ?? hashSeed(preset.id, Date.now()),
    randomness: applyRandomnessPreset(options.randomness),
    season: {
      year: preset.year,
      phase: "preseason",
      sourceSnapshotId: preset.sourceSnapshotId,
      ruleset: clone(preset.ruleset),
      drivers: clone(preset.drivers),
      teams: clone(preset.teams),
      circuits: clone(preset.circuits),
      weekends: clone(preset.weekends),
      contracts: clone(preset.contracts),
      currentRoundIndex: 0,
      completedWeekends: [],
      driverStandings: preset.drivers.map((driver) => ({ driverId: driver.id, points: 0, wins: 0, podiums: 0, poles: 0, finishes: {} })),
      teamStandings: preset.teams.map((team) => ({ teamId: team.id, points: 0, wins: 0 })),
      teamUpgrades: [],
      rulesLocked: false,
    },
    audit: [{ id: uid("audit"), action: "create-universe", summary: `Created from immutable ${preset.name} preset.`, at: now }],
    narratives: [],
    seasonHistory: [],
  };
  return normalizeUniverse(universe);
}

export function startWeekend(input: Universe): Universe {
  const universe = clone(input);
  if (universe.season.currentWeekend) throw new Error("A weekend is already active.");
  if (universe.season.currentRoundIndex >= universe.season.weekends.length) throw new Error("The season is already complete.");
  if (!["preseason", "between-weekends"].includes(universe.season.phase)) throw new Error("A weekend can only start from a stable season boundary.");

  const weekend = universe.season.weekends[universe.season.currentRoundIndex]!;
  const circuit = getCircuit(universe, weekend.circuitId);
  const rng = new DeterministicRng(hashSeed(universe.baseSeed, universe.season.year, weekend.round, "weekend", universe.season.completedWeekends.length));
  const qualifying = qualifyingResult(universe, circuit, rng);
  const sprint = weekend.sprint ? sprintResult(universe, qualifying, circuit, rng) : undefined;
  const race = createRace(universe, qualifying, circuit, rng);
  const pole = getDriver(universe, qualifying[0]!.driverId);
  race.events.push(event(universe, "start", `${pole.familyName} starts from pole as the field forms on the grid.`, 0, "notable", [pole.id]));
  const currentWeekend: WeekendState = { weekend, qualifying, sprint, race, startedAt: new Date().toISOString() };
  universe.season.currentWeekend = currentWeekend;
  universe.season.phase = "session";
  universe.season.rulesLocked = true;
  universe.updatedAt = new Date().toISOString();
  return universe;
}

function desiredTire(weather: Weather): TireCompound {
  if (weather === "storm" || weather === "rain") return "wet";
  if (weather === "drizzle") return "intermediate";
  return "medium";
}

function tireSuitability(tire: TireCompound, weather: Weather): number {
  if ((weather === "rain" || weather === "storm") && tire === "wet") return 1;
  if (weather === "drizzle" && tire === "intermediate") return 1;
  if ((weather === "clear" || weather === "cloudy") && ["soft", "medium", "hard"].includes(tire)) return 1;
  if (weather === "drizzle" && ["soft", "medium", "hard"].includes(tire)) return 0.7;
  return 0.35;
}

function changeWeather(universe: Universe, rng: DeterministicRng, circuit: Circuit): void {
  const session = universe.season.currentWeekend!.race;
  const chance = 0.008 * universe.randomness.weatherVolatility * (0.5 + circuit.profile.weatherTendency / 100);
  if (!rng.chance(chance)) return;
  const current = WEATHER_SEQUENCE.indexOf(session.weather);
  const next = WEATHER_SEQUENCE[Math.max(0, Math.min(WEATHER_SEQUENCE.length - 1, current + rng.pick([-1, 1])))]!;
  if (next === session.weather) return;
  session.weather = next;
  session.events.push(event(universe, "weather", `Conditions shift to ${next}; strategy models are recalculating.`, session.lap, "notable"));
}

function autonomousPit(universe: Universe, car: CarState, rng: DeterministicRng): void {
  const session = universe.season.currentWeekend!.race;
  const team = getTeam(universe, car.teamId);
  const driver = getDriver(universe, car.driverId);
  const target = desiredTire(session.weather);
  const mismatch = tireSuitability(car.tire, session.weather) < 0.8;
  const life = car.tire === "soft" ? 16 : car.tire === "medium" ? 27 : car.tire === "hard" ? 40 : 20;
  const threshold = life + (driver.ratings.tireManagement - 50) / 9 + (team.ratings.tirePreservation - 50) / 12;
  if (universe.season.ruleset.tireChanges === "single-set" && !mismatch) return;
  if (!mismatch && car.tireAge < threshold) return;
  if (!mismatch && !rng.chance(0.2 + team.ratings.strategy / 200)) return;
  const pitLoss = 17_000 + (100 - team.ratings.pitCrew) * 90 + rng.between(0, 1_800);
  car.elapsedMs += pitLoss;
  car.pitStops += 1;
  car.tireAge = 0;
  car.tire = mismatch ? target : car.tire === "soft" ? "medium" : "hard";
  if (universe.season.ruleset.refueling) car.fuel = Math.min(100, car.fuel + 46);
  session.events.push(event(universe, "pit", `${driver.familyName} pits for ${car.tire} tires.`, session.lap, mismatch ? "notable" : "routine", [driver.id], [team.id]));
}

function retireCar(universe: Universe, car: CarState, reason: string, severity: SimulationEvent["severity"] = "major"): void {
  const session = universe.season.currentWeekend!.race;
  if (car.status !== "running") return;
  car.status = "dnf";
  car.retiredReason = reason;
  const driver = getDriver(universe, car.driverId);
  session.events.push(event(universe, "retirement", `${driver.familyName} is out: ${reason}.`, session.lap, severity, [driver.id], [car.teamId]));
}

function maybeIncident(universe: Universe, car: CarState, rng: DeterministicRng, circuit: Circuit): void {
  const session = universe.season.currentWeekend!.race;
  const driver = getDriver(universe, car.driverId);
  const team = getTeam(universe, car.teamId);
  const wetMultiplier = ["drizzle", "rain", "storm"].includes(session.weather) ? 1.8 : 1;
  const crashChance = ((100 - driver.ratings.consistency) / 100) * 0.0018 * universe.randomness.incidentRate * wetMultiplier;
  const mechanicalChance = ((100 - team.ratings.reliability) / 100) * 0.0015 * universe.randomness.reliabilityVariance;
  if (rng.chance(crashChance)) {
    retireCar(universe, car, "accident damage");
    if (universe.season.ruleset.safetyCar && rng.chance(0.45 + circuit.profile.safetyCarTendency / 200)) {
      session.safetyCarLaps = Math.max(session.safetyCarLaps, rng.int(2, 4));
      session.events.push(event(universe, "safety-car", "Safety car deployed while marshals clear the circuit.", session.lap, "major"));
    }
    if (rng.chance(0.02 * universe.randomness.incidentRate)) {
      driver.injury = { status: "temporary", returnRound: Math.min(universe.season.weekends.length, universe.season.currentRoundIndex + rng.int(2, 5)) };
    }
  } else if (rng.chance(mechanicalChance)) {
    retireCar(universe, car, rng.pick(["power unit failure", "hydraulic failure", "gearbox problem", "electrical fault"]));
  }
}

function calculateLap(universe: Universe, car: CarState, rng: DeterministicRng, circuit: Circuit): { lapMs: number; factors: FactorBreakdown } {
  const driver = getDriver(universe, car.driverId);
  const team = getTeam(universe, car.teamId);
  const session = universe.season.currentWeekend!.race;
  const carScore = carPerformance(team, circuit);
  const driverScore = driverPerformance(driver, circuit, session.weather, false);
  const suitability = tireSuitability(car.tire, session.weather);
  const tireWear = Math.max(0, car.tireAge - 8) * (1.25 - driver.ratings.tireManagement / 200 - team.ratings.tirePreservation / 300);
  const pace = (100 - (carScore * 0.54 + driverScore * 0.46)) * 145;
  const strategy = (100 - team.ratings.strategy) * 6 + tireWear * 45 + (1 - suitability) * 11_000;
  const weather = ["rain", "storm"].includes(session.weather) ? (100 - driver.ratings.wetWeather) * 16 : 0;
  const traffic = circuit.profile.overtakingDifficulty * (car.position > 1 ? 4 : 0);
  const reliability = (100 - team.ratings.reliability) * rng.between(0, 2);
  const drama = -dramaModifier(driver) * 35;
  const randomness = rng.between(-700, 700) * universe.randomness.paceVariance;
  const safetyCar = session.safetyCarLaps > 0 ? 14_000 + car.position * 15 : 0;
  const base = 78_000 + circuit.profile.lapCount * 140;
  const lapMs = Math.max(55_000, base + pace + strategy + weather + traffic + reliability + drama + randomness + safetyCar);
  return { lapMs, factors: { pace, strategy, weather, traffic, reliability, drama, randomness } };
}

function classify(universe: Universe): RaceResultEntry[] {
  const session = universe.season.currentWeekend!.race;
  const sorted = [...session.cars].sort((a, b) => {
    const aRunning = a.status === "running" || a.status === "finished";
    const bRunning = b.status === "running" || b.status === "finished";
    if (aRunning !== bRunning) return aRunning ? -1 : 1;
    if (b.lapsCompleted !== a.lapsCompleted) return b.lapsCompleted - a.lapsCompleted;
    return a.elapsedMs + a.penaltyMs - (b.elapsedMs + b.penaltyMs);
  });
  const leaderTime = sorted[0]?.elapsedMs ?? 0;
  return sorted.map((car, index) => {
    const position = index + 1;
    const scoreable = !["dq", "dns", "nc"].includes(car.status);
    return {
      position,
      driverId: car.driverId,
      teamId: car.teamId,
      grid: car.startPosition,
      laps: car.lapsCompleted,
      elapsedMs: car.elapsedMs + car.penaltyMs,
      gapMs: Math.max(0, car.elapsedMs + car.penaltyMs - leaderTime),
      status: car.status === "running" ? "finished" : car.status,
      reason: car.retiredReason,
      points: scoreable ? universe.season.ruleset.points.find((rule) => rule.position === position)?.points ?? 0 : 0,
    };
  });
}

export function advanceLaps(input: Universe, count = 1): Universe {
  const universe = clone(input);
  const current = universe.season.currentWeekend;
  if (!current || current.race.status !== "running") throw new Error("No race is currently running.");
  const session = current.race;
  const circuit = getCircuit(universe, current.weekend.circuitId);
  const rng = new DeterministicRng(session.rngState);

  for (let step = 0; step < count && session.lap < session.totalLaps; step += 1) {
    session.lap += 1;
    changeWeather(universe, rng, circuit);
    const previousOrder = [...session.cars].sort((a, b) => a.position - b.position).map((car) => car.driverId);

    for (const car of session.cars.filter((candidate) => candidate.status === "running")) {
      autonomousPit(universe, car, rng);
      maybeIncident(universe, car, rng, circuit);
      if (car.status !== "running") continue;
      const { lapMs, factors } = calculateLap(universe, car, rng, circuit);
      car.lastLapMs = lapMs;
      car.elapsedMs += lapMs;
      car.lapsCompleted = session.lap;
      car.tireAge += 1;
      car.fuel = Math.max(0, car.fuel - (universe.season.ruleset.refueling ? 2.1 : 100 / session.totalLaps));
      if (car.position <= 3 || rng.chance(0.08)) {
        session.events.push(event(universe, "lap", `${getDriver(universe, car.driverId).familyName} completes lap ${session.lap}.`, session.lap, "routine", [car.driverId], [car.teamId], factors));
      }
    }

    const active = session.cars.filter((car) => car.status === "running").sort((a, b) => a.elapsedMs - b.elapsedMs);
    const retired = session.cars.filter((car) => car.status !== "running").sort((a, b) => b.lapsCompleted - a.lapsCompleted || a.elapsedMs - b.elapsedMs);
    session.cars = [...active, ...retired];
    const leader = active[0];
    session.cars.forEach((car, index) => {
      car.position = index + 1;
      car.gapMs = leader && car.status === "running" ? Math.max(0, car.elapsedMs - leader.elapsedMs) : 0;
    });
    if (previousOrder[0] && active[0] && previousOrder[0] !== active[0].driverId) {
      const newLeader = getDriver(universe, active[0].driverId);
      session.events.push(event(universe, "lead-change", `${newLeader.familyName} takes the lead.`, session.lap, "major", [newLeader.id], [active[0].teamId]));
    }
    for (const car of active) {
      const old = previousOrder.indexOf(car.driverId);
      const newPosition = car.position - 1;
      if (old >= 0 && old > newPosition) {
        const passed = previousOrder.slice(newPosition, old)
          .filter((driverId) => driverId !== car.driverId)
          .map((driverId) => getDriver(universe, driverId).familyName);
        const passedNames = passed.length === 1 ? passed[0] : `${passed.slice(0, -1).join(", ")} and ${passed.at(-1)}`;
        session.events.push(event(universe, "overtake", `${getDriver(universe, car.driverId).familyName} passes ${passedNames || `${old - newPosition} drivers`} in a decisive lap.`, session.lap, "notable", [car.driverId, ...previousOrder.slice(newPosition, old)], [car.teamId]));
      }
    }
    if (session.safetyCarLaps > 0) session.safetyCarLaps -= 1;
  }

  session.rngState = rng.getState();
  if (session.lap >= session.totalLaps) {
    for (const car of session.cars) if (car.status === "running") car.status = "finished";
    session.status = "complete";
    session.result = classify(universe);
    const winner = session.result[0];
    if (winner) session.events.push(event(universe, "finish", `${getDriver(universe, winner.driverId).familyName} wins the ${current.weekend.name}.`, session.lap, "major", [winner.driverId], [winner.teamId]));
  }
  universe.updatedAt = new Date().toISOString();
  return universe;
}

export function finishSession(input: Universe): Universe {
  let universe = clone(input);
  const remaining = universe.season.currentWeekend?.race.totalLaps ?? 0;
  if (!universe.season.currentWeekend) throw new Error("No weekend is active.");
  universe = advanceLaps(universe, Math.max(0, remaining - universe.season.currentWeekend.race.lap));
  return universe;
}

export function applyIntervention(
  input: Universe,
  draft: Omit<Intervention, "id" | "sessionId" | "lap" | "confirmedAt">,
): Universe {
  const universe = clone(input);
  const session = universe.season.currentWeekend?.race;
  if (!session || session.status !== "running") throw new Error("Interventions require an active session.");
  const intervention: Intervention = {
    ...draft,
    id: uid("intervention"),
    sessionId: session.id,
    lap: session.lap,
    confirmedAt: new Date().toISOString(),
  };
  const car = intervention.driverId ? session.cars.find((candidate) => candidate.driverId === intervention.driverId) : undefined;
  switch (intervention.kind) {
    case "set-weather":
      if (!WEATHER_SEQUENCE.includes(intervention.value as Weather)) throw new Error("Invalid weather value.");
      session.weather = intervention.value as Weather;
      break;
    case "deploy-safety-car":
      session.safetyCarLaps = Math.max(1, Number(intervention.value) || 3);
      break;
    case "retire-driver":
      if (!car) throw new Error("Select a driver to retire.");
      retireCar(universe, car, intervention.note || "race-control retirement");
      break;
    case "add-penalty":
      if (!car) throw new Error("Select a driver to penalize.");
      car.penaltyMs += Math.max(0, Number(intervention.value) || 5) * 1_000;
      break;
    case "force-pit":
      if (!car) throw new Error("Select a driver to pit.");
      car.elapsedMs += 20_000;
      car.pitStops += 1;
      car.tireAge = 0;
      break;
    case "set-tire":
      if (!car) throw new Error("Select a driver.");
      car.tire = intervention.value as TireCompound;
      car.tireAge = 0;
      break;
    case "force-position": {
      if (!car) throw new Error("Select a driver.");
      const target = Math.max(1, Math.min(session.cars.length, Number(intervention.value) || 1));
      const sorted = [...session.cars].sort((a, b) => a.elapsedMs - b.elapsedMs);
      const anchor = sorted[target - 1];
      if (anchor) car.elapsedMs = Math.max(0, anchor.elapsedMs - 1);
      break;
    }
  }
  const driverName = car ? getDriver(universe, car.driverId).familyName : "the session";
  session.events.push(event(universe, "intervention", `Race control changed ${driverName}: ${intervention.note}.`, session.lap, "major", car ? [car.driverId] : [], car ? [car.teamId] : []));
  universe.audit.push({ id: uid("audit"), action: intervention.kind, summary: intervention.note, at: intervention.confirmedAt, intervention });
  universe.updatedAt = intervention.confirmedAt;
  return universe;
}

export function finalizeWeekend(input: Universe): Universe {
  let universe = clone(input);
  const current = universe.season.currentWeekend;
  if (!current || current.race.status !== "complete" || !current.race.result) throw new Error("Finish the race before finalizing the weekend.");
  universe.season.completedWeekends.push({
    weekend: current.weekend,
    qualifying: current.qualifying,
    sprint: current.sprint,
    race: current.race.result,
    events: current.race.events,
    finalizedAt: new Date().toISOString(),
    voided: false,
  });
  universe.season.currentRoundIndex += 1;
  universe.season.currentWeekend = undefined;
  universe.season.phase = universe.season.currentRoundIndex >= universe.season.weekends.length ? "season-complete" : "between-weekends";
  if (universe.season.phase !== "season-complete") universe = applyInSeasonDevelopment(universe);
  const activeDriverIds = universe.season.teams.flatMap((team) => team.driverIds);
  const rebuilt = rebuildStandings(
    activeDriverIds,
    universe.season.teams.map((team) => team.id),
    universe.season.completedWeekends,
  );
  universe.season.driverStandings = rebuilt.drivers;
  universe.season.teamStandings = rebuilt.teams;
  universe = recalculateSeasonPerformance(universe);
  universe.audit.push({ id: uid("audit"), action: "finalize-weekend", summary: `Finalized ${current.weekend.name}.`, at: new Date().toISOString() });
  universe.updatedAt = new Date().toISOString();
  return universe;
}

export function voidLastWeekend(input: Universe): Universe {
  let universe = clone(input);
  if (universe.season.currentWeekend) throw new Error("Cannot void a result while another weekend is active.");
  const last = [...universe.season.completedWeekends].reverse().find((weekend) => !weekend.voided);
  if (!last) throw new Error("There is no finalized weekend to void.");
  last.voided = true;
  universe.season.currentRoundIndex = last.weekend.round - 1;
  universe.season.phase = universe.season.currentRoundIndex === 0 ? "preseason" : "between-weekends";
  // A voided result rewinds the deterministic checkpoint before that weekend.
  // Development packages announced after it must not leak into the rerun.
  const upgrades = universe.season.teamUpgrades ?? [];
  const retainedUpgrades = upgrades.filter((upgrade) => upgrade.round <= last.weekend.round);
  for (const upgrade of upgrades.filter((candidate) => candidate.round > last.weekend.round)) {
    const team = universe.season.teams.find((candidate) => candidate.id === upgrade.teamId);
    if (team) team.ratings[upgrade.field] = Math.max(0, Math.min(100, team.ratings[upgrade.field] - upgrade.delta));
  }
  universe.season.teamUpgrades = retainedUpgrades;
  const activeDriverIds = universe.season.teams.flatMap((team) => team.driverIds);
  const rebuilt = rebuildStandings(
    activeDriverIds,
    universe.season.teams.map((team) => team.id),
    universe.season.completedWeekends,
  );
  universe.season.driverStandings = rebuilt.drivers;
  universe.season.teamStandings = rebuilt.teams;
  universe = recalculateSeasonPerformance(universe);
  universe.audit.push({ id: uid("audit"), action: "void-weekend", summary: `Voided ${last.weekend.name}; the original remains in history.`, at: new Date().toISOString() });
  return startWeekend(universe);
}

export function fastForwardSeason(input: Universe): Universe {
  let universe = clone(input);
  while (universe.season.phase !== "season-complete") {
    if (!universe.season.currentWeekend) universe = startWeekend(universe);
    if (universe.season.currentWeekend?.race.status === "running") universe = finishSession(universe);
    universe = finalizeWeekend(universe);
  }
  return universe;
}

export function forkUniverse(input: Universe, name = `${input.name} branch`): Universe {
  if (input.season.phase === "session") throw new Error("Universes can only branch between completed weekends.");
  const universe = clone(input);
  const parentId = universe.id;
  const now = new Date().toISOString();
  universe.id = uid("universe");
  universe.name = name;
  universe.parentUniverseId = parentId;
  universe.branchRound = universe.season.currentRoundIndex;
  universe.createdAt = now;
  universe.updatedAt = now;
  universe.audit.push({ id: uid("audit"), action: "fork-universe", summary: `Branched after round ${universe.season.currentRoundIndex}.`, at: now });
  return universe;
}

export function moveDriver(input: Universe, driverId: string, toTeamId: string, seat: 0 | 1): Universe {
  const universe = clone(input);
  if (universe.season.phase === "session") throw new Error("Driver moves take effect between weekends.");
  const targetTeam = getTeam(universe, toTeamId);
  const displaced = targetTeam.driverIds[seat];
  const oldTeam = universe.season.teams.find((team) => team.driverIds.includes(driverId));
  targetTeam.driverIds[seat] = driverId;
  if (oldTeam) {
    const oldSeat = oldTeam.driverIds.indexOf(driverId) as 0 | 1;
    oldTeam.driverIds[oldSeat] = displaced;
  }
  universe.audit.push({ id: uid("audit"), action: "driver-move", summary: `${driverId} moved to ${targetTeam.name}; effective next weekend.`, at: new Date().toISOString() });
  return universe;
}

export function dispatch(input: Universe, command: SimulationCommand): Universe {
  switch (command.type) {
    case "start-weekend": return startWeekend(input);
    case "advance-laps": return advanceLaps(input, command.laps);
    case "finish-session": return finishSession(input);
    case "intervene": return applyIntervention(input, command.intervention);
    case "finalize-weekend": return finalizeWeekend(input);
    case "void-last-weekend": return voidLastWeekend(input);
    case "apply-driver-move": return moveDriver(input, command.driverId, command.toTeamId, command.seat);
    case "approve-offseason": return input;
  }
}

export function exportUniverse(universe: Universe): string {
  return JSON.stringify({ kind: "f1-sim-universe", exportedAt: new Date().toISOString(), universe }, null, 2);
}

export function importUniverse(serialized: string): Universe {
  const parsed = JSON.parse(serialized) as { kind?: string; universe?: unknown };
  if (parsed.kind !== "f1-sim-universe" || !parsed.universe) throw new Error("Unsupported F1 SIM backup.");
  return normalizeUniverse(parsed.universe);
}

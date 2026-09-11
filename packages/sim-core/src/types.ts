export type Id = string;
export type Confidence = "high" | "medium" | "low";
export type Weather = "clear" | "cloudy" | "drizzle" | "rain" | "storm";
export type TireCompound = "soft" | "medium" | "hard" | "intermediate" | "wet";
export type SessionKind = "qualifying" | "sprint" | "race";
export type SessionStatus = "ready" | "running" | "complete" | "void";
export type SeasonPhase = "preseason" | "between-weekends" | "session" | "season-complete" | "offseason";
export type UniverseMode = "standalone" | "dynasty";

export interface RatingEvidence {
  source: string;
  method: string;
  confidence: Confidence;
  updatedAt: string;
}

export interface DriverRatings {
  qualifyingPace: number;
  racePace: number;
  tireManagement: number;
  overtaking: number;
  defending: number;
  braking: number;
  cornering: number;
  wetWeather: number;
  consistency: number;
  experience: number;
}

export interface TeamRatings {
  power: number;
  aerodynamics: number;
  mechanicalGrip: number;
  tirePreservation: number;
  reliability: number;
  pitCrew: number;
  strategy: number;
  developmentPotential: number;
}

export type TeamPerformanceField = Exclude<keyof TeamRatings, "developmentPotential">;

export interface TeamUpgrade {
  id: Id;
  teamId: Id;
  season: number;
  /** Round number at which this change is first reflected in the car. */
  round: number;
  field: TeamPerformanceField;
  delta: number;
  summary: string;
}

export interface CircuitProfile {
  power: number;
  aero: number;
  traction: number;
  braking: number;
  tireStress: number;
  overtakingDifficulty: number;
  weatherTendency: number;
  safetyCarTendency: number;
  lapCount: number;
}

export interface Driver {
  id: Id;
  givenName: string;
  familyName: string;
  code: string;
  number: number;
  nationality: string;
  age: number;
  ratings: DriverRatings;
  potential: number;
  form: number;
  morale: number;
  pressure: number;
  injury?: {
    status: "temporary" | "season-ending";
    returnRound?: number;
  };
  evidence: RatingEvidence;
}

export interface Team {
  id: Id;
  name: string;
  shortName: string;
  color: string;
  driverIds: [Id, Id];
  ratings: TeamRatings;
  evidence: RatingEvidence;
}

export interface Circuit {
  id: Id;
  name: string;
  country: string;
  city: string;
  profile: CircuitProfile;
  artKey?: string;
  evidence: RatingEvidence;
}

export interface Weekend {
  id: Id;
  round: number;
  name: string;
  circuitId: Id;
  sprint: boolean;
}

export interface PointsRule {
  position: number;
  points: number;
}

export interface Ruleset {
  id: Id;
  name: string;
  year: number;
  points: PointsRule[];
  sprintPoints: PointsRule[];
  constructorsChampionship: boolean;
  qualifyingFormat: "aggregate" | "single-session" | "knockout";
  refueling: boolean;
  tireChanges: "single-set" | "optional" | "required-dry-compounds";
  safetyCar: boolean;
  fastestLapPoint: boolean;
  partialPoints: boolean;
}

export interface Contract {
  id: Id;
  driverId: Id;
  teamId: Id;
  salaryCredits: number;
  startSeason: number;
  endSeason: number;
  role: "lead" | "equal" | "support" | "reserve";
  optionYears: number;
  performanceExitPosition?: number;
  teamExitPosition?: number;
  buyoutCredits: number;
  status: "active" | "agreed" | "expired" | "terminated";
}

export interface SeasonPreset {
  id: Id;
  year: number;
  name: string;
  sourceSnapshotId: Id;
  sourceNote: string;
  ruleset: Ruleset;
  drivers: Driver[];
  teams: Team[];
  circuits: Circuit[];
  weekends: Weekend[];
  contracts: Contract[];
}

export interface SourceSnapshot {
  id: Id;
  provider: "bundled" | "jolpica";
  season: number;
  fetchedAt: string;
  schemaVersion: number;
  immutable: true;
  note: string;
}

export interface RandomnessSettings {
  preset: "stable" | "realistic" | "chaotic";
  paceVariance: number;
  incidentRate: number;
  reliabilityVariance: number;
  weatherVolatility: number;
  developmentVariance: number;
}

export interface DriverStanding {
  driverId: Id;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  finishes: Record<number, number>;
}

export interface TeamStanding {
  teamId: Id;
  points: number;
  wins: number;
}

export interface CarState {
  driverId: Id;
  teamId: Id;
  position: number;
  startPosition: number;
  lapsCompleted: number;
  elapsedMs: number;
  lastLapMs: number;
  gapMs: number;
  tire: TireCompound;
  tireAge: number;
  fuel: number;
  pitStops: number;
  penaltyMs: number;
  status: "running" | "finished" | "dnf" | "dns" | "dq" | "nc";
  retiredReason?: string;
}

export interface FactorBreakdown {
  pace: number;
  strategy: number;
  weather: number;
  traffic: number;
  reliability: number;
  drama: number;
  randomness: number;
}

export interface SimulationEvent {
  id: Id;
  type:
    | "start"
    | "lap"
    | "lead-change"
    | "overtake"
    | "pit"
    | "weather"
    | "incident"
    | "retirement"
    | "safety-car"
    | "penalty"
    | "finish"
    | "intervention"
    | "story";
  session: SessionKind;
  lap: number;
  severity: "routine" | "notable" | "major";
  message: string;
  driverIds: Id[];
  teamIds: Id[];
  factors?: FactorBreakdown;
  createdAt: string;
}

export type InterventionKind =
  | "set-weather"
  | "deploy-safety-car"
  | "retire-driver"
  | "add-penalty"
  | "force-pit"
  | "set-tire"
  | "force-position";

export interface Intervention {
  id: Id;
  kind: InterventionKind;
  sessionId: Id;
  lap: number;
  driverId?: Id;
  value?: string | number;
  note: string;
  confirmedAt: string;
}

export interface RaceResultEntry {
  position: number;
  driverId: Id;
  teamId: Id;
  grid: number;
  laps: number;
  elapsedMs: number;
  gapMs: number;
  status: CarState["status"];
  reason?: string;
  points: number;
}

export interface SessionState {
  id: Id;
  kind: SessionKind;
  status: SessionStatus;
  lap: number;
  totalLaps: number;
  weather: Weather;
  forecast: Weather[];
  safetyCarLaps: number;
  rngState: number;
  cars: CarState[];
  events: SimulationEvent[];
  result?: RaceResultEntry[];
}

export interface CompletedWeekend {
  weekend: Weekend;
  qualifying: RaceResultEntry[];
  sprint?: RaceResultEntry[];
  race: RaceResultEntry[];
  events: SimulationEvent[];
  finalizedAt: string;
  voided: boolean;
}

/** Immutable snapshot of a completed dynasty season for the archive view. */
export interface SeasonArchive {
  year: number;
  drivers: Driver[];
  teams: Team[];
  completedWeekends: CompletedWeekend[];
  driverStandings: DriverStanding[];
  teamStandings: TeamStanding[];
}

export interface WeekendState {
  weekend: Weekend;
  qualifying: RaceResultEntry[];
  sprint?: RaceResultEntry[];
  race: SessionState;
  startedAt: string;
}

export interface NarrativeVersion {
  id: Id;
  scope: "event" | "session" | "weekend" | "paddock" | "offseason";
  scopeId: Id;
  text: string;
  provider: "gemini" | "manual";
  model: string;
  promptVersion: string;
  status: "complete" | "queued" | "failed";
  createdAt: string;
  replacesId?: Id;
}

export interface AuditEntry {
  id: Id;
  action: string;
  summary: string;
  at: string;
  intervention?: Intervention;
}

export interface OffseasonProposal {
  id: Id;
  targetSeason: number;
  status: "pending" | "approved" | "rejected";
  summary: string;
  driverMoves: Array<{ driverId: Id; fromTeamId?: Id; toTeamId: Id }>;
  ratingChanges: Array<{ teamId: Id; field: keyof TeamRatings; delta: number }>;
  calendarChanges: string[];
  ruleChanges: string[];
  /** Generated free agents who can be signed or placed into a seat after approval. */
  rookies?: Driver[];
}

export interface SeasonState {
  year: number;
  phase: SeasonPhase;
  sourceSnapshotId: Id;
  ruleset: Ruleset;
  drivers: Driver[];
  teams: Team[];
  circuits: Circuit[];
  weekends: Weekend[];
  contracts: Contract[];
  currentRoundIndex: number;
  currentWeekend?: WeekendState;
  completedWeekends: CompletedWeekend[];
  driverStandings: DriverStanding[];
  teamStandings: TeamStanding[];
  /** Development changes applied between race weekends. Optional for v1 saves. */
  teamUpgrades?: TeamUpgrade[];
  rulesLocked: boolean;
  offseasonProposal?: OffseasonProposal;
}

export interface Universe {
  schemaVersion: 1;
  id: Id;
  name: string;
  mode: UniverseMode;
  createdAt: string;
  updatedAt: string;
  baseSeed: number;
  randomness: RandomnessSettings;
  season: SeasonState;
  audit: AuditEntry[];
  narratives: NarrativeVersion[];
  /** Prior completed dynasty seasons; optional for existing v1 saves. */
  seasonHistory?: SeasonArchive[];
  parentUniverseId?: Id;
  branchRound?: number;
}

export type SimulationCommand =
  | { type: "start-weekend" }
  | { type: "advance-laps"; laps: number }
  | { type: "finish-session" }
  | { type: "intervene"; intervention: Omit<Intervention, "id" | "sessionId" | "lap" | "confirmedAt"> }
  | { type: "finalize-weekend" }
  | { type: "void-last-weekend" }
  | { type: "apply-driver-move"; driverId: Id; toTeamId: Id; seat: 0 | 1 }
  | { type: "approve-offseason" };

export interface NarrativeRequest {
  scope: NarrativeVersion["scope"];
  scopeId: Id;
  season: number;
  title: string;
  facts: string[];
  characters: Array<{ id: Id; name: string; team?: string }>;
  tone: "live" | "recap" | "paddock";
  previousContext?: string;
  storyContext?: NarrativeStoryContext;
}

export interface NarrativeStoryContext {
  seasonArc: string[];
  rivalries: Array<{ title: string; drivers: string[]; summary: string }>;
  teamDramas: Array<{ team: string; summary: string }>;
  driverTrajectories: Array<{ name: string; age: number; potential: number; rating: number; points: number; trend: string }>;
  teamTrajectories: Array<{ team: string; points: number; trend: string; upgrades: number }>;
  upgrades: Array<{ team: string; round: number; summary: string }>;
}

export interface NarrativeProvider {
  generate(request: NarrativeRequest): Promise<Omit<NarrativeVersion, "id" | "createdAt">>;
}

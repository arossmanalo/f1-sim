export type Id = string;
export type Confidence = "high" | "medium" | "low";
export type Weather = "clear" | "cloudy" | "drizzle" | "rain" | "storm";
export type TireCompound = "soft" | "medium" | "hard" | "intermediate" | "wet";
export type SessionKind = "qualifying" | "sprint" | "race";
export type SessionStatus = "ready" | "running" | "complete" | "void";
export type SeasonPhase = "preseason" | "between-weekends" | "session" | "season-complete" | "offseason";
export type UniverseMode = "standalone" | "dynasty";
export type DriverStatus = "f1" | "reserve" | "free-agent" | "f2" | "f3" | "other-motorsport" | "retired";
export type DriverCareerPhase = "early-development" | "rapid-development" | "early-prime" | "prime" | "late-prime" | "decline";
export type DriverArchetype =
  | "all-rounder"
  | "qualifying-specialist"
  | "racecraft-specialist"
  | "tire-whisperer"
  | "wet-weather-specialist"
  | "aggressive-racer"
  | "consistent-driver"
  | "technical-driver"
  | "late-bloomer"
  | "prodigy"
  | "pay-driver"
  | "development-project"
  | "veteran-leader";
export type TeamPhilosophy = "championship" | "balanced" | "development" | "financial-survival";
export type TeamStrategyState = "DOMINANT" | "TITLE_CONTENDER" | "CONTENDING" | "MIDFIELD" | "REBUILDING" | "DEVELOPING" | "FINANCIAL_DIFFICULTY";

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

export interface DriverAdvancedRatings {
  adaptability: number;
  technicalFeedback: number;
  pressureHandling: number;
}

export interface DriverPersonality {
  ambition: number;
  loyalty: number;
  aggression: number;
  patience: number;
  riskTolerance: number;
  moneyMotivation: number;
  teamwork: number;
  confidence: number;
  workEthic: number;
  marketability: number;
}

export interface DriverCareerStats {
  seasons: number;
  teamIds: Id[];
  raceStarts: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  points: number;
  championships: number;
  bestChampionshipFinish?: number;
  careerEarningsCredits: number;
}

export interface TeamCareerStats {
  constructorsChampionships: number;
  raceWins: number;
  podiums: number;
  driverChampionships: number;
  seasonResults: Array<{ season: number; position: number; points: number }>;
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

export type RetirementAttribution = "none" | "mechanical" | "driver" | "other";
export type PerformanceExclusionReason = "missing-result" | "mechanical-dnf" | "unattributed-dnf" | "dns" | "dq";

/** A result interpreted against the car and driver combination that produced it. */
export interface RelativeToMachineryScore {
  machineryRank: number;
  machineryRating: number;
  machineryExpectedPosition: number;
  expectedPosition: number;
  actualPosition?: number;
  positionDelta?: number;
  score: number;
  eligible: boolean;
  exclusionReason?: PerformanceExclusionReason;
}

/** Per-weekend comparison; invalid race samples never leak into race head-to-heads. */
export interface TeammateComparison {
  teammateId?: Id;
  eligible: boolean;
  qualifyingEligible: boolean;
  raceEligible: boolean;
  qualifyingPositionDelta?: number;
  racePositionDelta?: number;
  pointsDelta?: number;
  qualifyingResult?: "win" | "loss" | "tie";
  raceResult?: "win" | "loss" | "tie";
  score: number;
  excludedReasons: PerformanceExclusionReason[];
}

export interface DriverWeekendPerformance {
  weekendId: Id;
  round: number;
  teamId: Id;
  qualifyingPosition?: number;
  racePosition?: number;
  raceStatus?: CarState["status"];
  points: number;
  retirementAttribution: RetirementAttribution;
  relativeToMachinery: RelativeToMachineryScore;
  teammateComparison: TeammateComparison;
  weekendScore: number;
  confidenceDelta: number;
}

export interface HeadToHeadRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface DriverSeasonPerformance {
  driverId: Id;
  starts: number;
  validFinishes: number;
  mechanicalDnfs: number;
  driverIncidents: number;
  points: number;
  pointsPerValidFinish: number;
  averageQualifyingPosition?: number;
  averageFinishingPosition?: number;
  averageRelativeToMachinery: number;
  averageWeekendScore: number;
  rollingForm: number;
  teamConfidenceByTeamId: Record<Id, number>;
  qualifyingHeadToHead: HeadToHeadRecord;
  raceHeadToHead: HeadToHeadRecord;
  averageQualifyingTeammateDelta?: number;
  averageRaceTeammateDelta?: number;
  weekends: DriverWeekendPerformance[];
}

export interface SeasonPerformance {
  version: 1;
  season: number;
  evaluatedThroughRound: number;
  baselineFormByDriverId: Record<Id, number>;
  drivers: Record<Id, DriverSeasonPerformance>;
}

export interface PerformanceEvaluationConfig {
  rollingWindowRaces: number;
  baselineTeamConfidence: number;
  maximumConfidenceMovementPerRace: number;
  confidenceSensitivity: number;
  raceWeight: number;
  qualifyingWeight: number;
  teammateWeight: number;
  driverIncidentPenalty: number;
  unexpectedPodiumBonus: number;
  formBaselineWeight: number;
  machineryExpectationWeight: number;
  driverExpectationWeight: number;
  gridContextWeight: number;
  teammateQualifyingWeight: number;
  teammateRaceWeight: number;
  teammatePointsWeight: number;
  incompleteRaceConfidenceMultiplier: number;
  resultPositionScale: number;
  qualifyingPositionScale: number;
  teammatePositionScale: number;
  teammatePointsScale: number;
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
  /** Career fields are optional on legacy v1 data and populated by normalizeUniverse. */
  potentialMin?: number;
  potentialMax?: number;
  developmentRate?: number;
  generatedDriver?: boolean;
  countryCode?: string;
  status?: DriverStatus;
  careerPhase?: DriverCareerPhase;
  archetype?: DriverArchetype;
  advancedRatings?: DriverAdvancedRatings;
  personality?: DriverPersonality;
  careerStats?: DriverCareerStats;
  reputation?: number;
  financialBackingCredits?: number;
  sponsorshipValue?: number;
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
  /** Organization fields are optional on legacy v1 data and populated by normalizeUniverse. */
  reputation?: number;
  budgetCredits?: number;
  driverBudgetCredits?: number;
  developmentQuality?: number;
  academyQuality?: number;
  facilities?: number;
  scoutingQuality?: number;
  philosophy?: TeamPhilosophy;
  strategyState?: TeamStrategyState;
  riskTolerance?: number;
  prestige?: number;
  championshipExpectations?: number;
  /** Rolling confidence each constructor has in its current drivers. */
  driverConfidence?: Record<Id, number>;
  careerStats?: TeamCareerStats;
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
  effectiveSeason?: number;
  origin?: "preset" | "renewal" | "market" | "override" | "migration";
  decidedAt?: string;
  terminationReason?: string;
  decisionId?: Id;
}

export interface UtilityScoreBreakdown {
  totalScore: number;
  components: Record<string, number>;
  modifiers?: Record<string, number>;
}

export type ManagementDecisionKind = "renew" | "wait" | "replace" | "offer" | "accept" | "reject" | "counter" | "promote" | "release" | "retire" | "develop";

export interface AiDecision {
  id: Id;
  season: number;
  kind: ManagementDecisionKind;
  actorType: "team" | "driver" | "system";
  actorId: Id;
  targetIds: Id[];
  outcome: string;
  reasons: string[];
  utility?: UtilityScoreBreakdown;
  createdAt: string;
}

export interface ManagementEvent {
  id: Id;
  season: number;
  round?: number;
  type: "contract" | "transfer" | "promotion" | "release" | "retirement" | "development" | "team-state" | "recovery";
  summary: string;
  driverIds: Id[];
  teamIds: Id[];
  decisionId?: Id;
  createdAt: string;
}

export interface JuniorState {
  season: number;
  f3DriverIds: Id[];
  f2DriverIds: Id[];
  reserveDriverIds: Id[];
  academyDriverIdsByTeam: Record<Id, Id[]>;
  incomingClassDriverIds: Id[];
}

export interface TeamPhilosophyWeights {
  currentPerformance: number;
  consistency: number;
  experience: number;
  potential: number;
  age: number;
  academyStatus: number;
  marketability: number;
  salaryEfficiency: number;
  teamFit: number;
}

export interface WorldConfig {
  version: 1;
  debugAiDecisions: boolean;
  driverOverallWeights: {
    racePace: number;
    qualifyingPace: number;
    consistency: number;
    wetWeather: number;
    tireManagement: number;
    experience: number;
    defending: number;
    overtaking: number;
    adaptability: number;
    technicalFeedback: number;
    pressureHandling: number;
  };
  teamPhilosophyWeights: Record<TeamPhilosophy, TeamPhilosophyWeights>;
  development: { minimumRate: number; maximumRate: number; yearlyVariance: number; maximumYearlyOverallChange: number };
  retirement: { minimumAge: number; baseAge: number; steepDeclineAge: number; noSeatModifier: number };
  market: { maximumRounds: number; maximumIterations: number; minimumContractYears: number; maximumContractYears: number; salaryFloorCredits: number };
  generation: { f3PerSeason: number; promotionMinimumAge: number; generationalTalentChance: number; nationalityWeights: Record<string, number> };
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
  driverChampionId?: Id;
  constructorChampionId?: Id;
  managementEvents?: ManagementEvent[];
  aiDecisions?: AiDecision[];
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
  /** Deterministic post-race evaluation; optional for saves created before schema v2. */
  performance?: SeasonPerformance;
  rulesLocked: boolean;
  offseasonProposal?: OffseasonProposal;
}

export interface Universe {
  schemaVersion: 1 | 2;
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
  /** Autonomous-world fields are optional only for persisted v1 saves. */
  worldConfig?: WorldConfig;
  juniorState?: JuniorState;
  aiDecisions?: AiDecision[];
  managementEvents?: ManagementEvent[];
  parentUniverseId?: Id;
  branchRound?: number;
}

export type NormalizedDriver = Driver & Required<Pick<Driver,
  "potentialMin" | "potentialMax" | "developmentRate" | "generatedDriver" | "countryCode" | "status" |
  "careerPhase" | "archetype" | "advancedRatings" | "personality" | "careerStats" | "reputation" |
  "financialBackingCredits" | "sponsorshipValue"
>>;

export type NormalizedTeam = Team & Required<Pick<Team,
  "reputation" | "budgetCredits" | "driverBudgetCredits" | "developmentQuality" | "academyQuality" |
  "facilities" | "scoutingQuality" | "philosophy" | "strategyState" | "riskTolerance" | "prestige" |
  "championshipExpectations" | "careerStats"
>>;

export interface NormalizedUniverse extends Omit<Universe, "schemaVersion" | "season" | "seasonHistory" | "worldConfig" | "juniorState" | "aiDecisions" | "managementEvents"> {
  schemaVersion: 2;
  season: Omit<SeasonState, "drivers" | "teams"> & { drivers: NormalizedDriver[]; teams: NormalizedTeam[] };
  worldConfig: WorldConfig;
  juniorState: JuniorState;
  aiDecisions: AiDecision[];
  managementEvents: ManagementEvent[];
  seasonHistory: SeasonArchive[];
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

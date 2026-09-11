import type {
  Circuit,
  Contract,
  Driver,
  DriverRatings,
  RatingEvidence,
  Ruleset,
  SeasonPreset,
  Team,
  TeamRatings,
  Weekend,
} from "./types";

const snapshotDate = "2026-09-11T00:00:00.000Z";

const highEvidence = (source: string): RatingEvidence => ({ source, method: "Results-derived percentile model with teammate adjustment", confidence: "high", updatedAt: snapshotDate });
const mediumEvidence = (source: string): RatingEvidence => ({ source, method: "Rolling result blend with era priors", confidence: "medium", updatedAt: snapshotDate });
const circuitEvidence: RatingEvidence = { source: "Curated circuit profile", method: "Layout and historical race-character profile", confidence: "medium", updatedAt: snapshotDate };

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratings(base: number, changes: Partial<DriverRatings> = {}): DriverRatings {
  return {
    qualifyingPace: clamp(changes.qualifyingPace ?? base + 1),
    racePace: clamp(changes.racePace ?? base),
    tireManagement: clamp(changes.tireManagement ?? base - 1),
    overtaking: clamp(changes.overtaking ?? base),
    defending: clamp(changes.defending ?? base - 1),
    braking: clamp(changes.braking ?? base),
    cornering: clamp(changes.cornering ?? base + 1),
    wetWeather: clamp(changes.wetWeather ?? base - 2),
    consistency: clamp(changes.consistency ?? base),
    experience: clamp(changes.experience ?? base),
  };
}

function driver(
  year: number,
  code: string,
  givenName: string,
  familyName: string,
  number: number,
  nationality: string,
  age: number,
  base: number,
  evidence: RatingEvidence,
  changes: Partial<DriverRatings> = {},
): Driver {
  return {
    id: `${year}-${code.toLowerCase()}`,
    givenName,
    familyName,
    code,
    number,
    nationality,
    age,
    ratings: ratings(base, changes),
    potential: clamp(base + (age < 25 ? 5 : 1)),
    form: 50,
    morale: 50,
    pressure: 50,
    evidence,
  };
}

function teamRatings(base: number, changes: Partial<TeamRatings> = {}): TeamRatings {
  return {
    power: clamp(changes.power ?? base),
    aerodynamics: clamp(changes.aerodynamics ?? base),
    mechanicalGrip: clamp(changes.mechanicalGrip ?? base),
    tirePreservation: clamp(changes.tirePreservation ?? base - 2),
    reliability: clamp(changes.reliability ?? base - 1),
    pitCrew: clamp(changes.pitCrew ?? base - 2),
    strategy: clamp(changes.strategy ?? base - 1),
    developmentPotential: clamp(changes.developmentPotential ?? base),
  };
}

function team(year: number, id: string, name: string, shortName: string, color: string, driverCodes: [string, string], base: number, evidence: RatingEvidence, changes: Partial<TeamRatings> = {}): Team {
  return { id: `${year}-${id}`, name, shortName, color, driverIds: driverCodes.map((code) => `${year}-${code.toLowerCase()}`) as [string, string], ratings: teamRatings(base, changes), evidence };
}

function circuit(id: string, name: string, country: string, city: string, lapCount: number, type: "power" | "aero" | "street" | "balanced", weather = 40): Circuit {
  const profiles = {
    power: { power: 92, aero: 45, traction: 58, braking: 78, tireStress: 54, overtakingDifficulty: 38, safetyCarTendency: 35 },
    aero: { power: 42, aero: 94, traction: 73, braking: 66, tireStress: 68, overtakingDifficulty: 73, safetyCarTendency: 38 },
    street: { power: 62, aero: 78, traction: 91, braking: 84, tireStress: 43, overtakingDifficulty: 79, safetyCarTendency: 82 },
    balanced: { power: 72, aero: 76, traction: 72, braking: 72, tireStress: 66, overtakingDifficulty: 55, safetyCarTendency: 44 },
  } as const;
  return { id, name, country, city, profile: { ...profiles[type], weatherTendency: weather, lapCount }, artKey: id, evidence: circuitEvidence };
}

function weekends(year: number, entries: Array<[string, string, boolean?]>): Weekend[] {
  return entries.map(([name, circuitId, sprint], index) => ({ id: `${year}-round-${index + 1}`, round: index + 1, name, circuitId, sprint: Boolean(sprint) }));
}

function contractsFor(year: number, teams: Team[], drivers: Driver[]): Contract[] {
  return teams.flatMap((entry) => entry.driverIds.map((driverId, seat) => {
    const person = drivers.find((candidate) => candidate.id === driverId)!;
    const ability = (person.ratings.racePace + person.ratings.qualifyingPace) / 2;
    return {
      id: `contract-${year}-${entry.id}-${seat}`,
      driverId,
      teamId: entry.id,
      salaryCredits: Math.round(ability * ability * (seat === 0 ? 1.15 : 0.9)),
      startSeason: year,
      endSeason: year + (seat === 0 ? 2 : 1),
      role: seat === 0 ? "lead" as const : "equal" as const,
      optionYears: 1,
      performanceExitPosition: 8,
      teamExitPosition: 7,
      buyoutCredits: Math.round(ability * 260),
      status: "active" as const,
    };
  }));
}

const rules2005: Ruleset = {
  id: "rules-2005",
  name: "2005 major-era rules",
  year: 2005,
  points: [10, 8, 6, 5, 4, 3, 2, 1].map((points, index) => ({ position: index + 1, points })),
  sprintPoints: [],
  constructorsChampionship: true,
  qualifyingFormat: "aggregate",
  refueling: true,
  tireChanges: "single-set",
  safetyCar: true,
  fastestLapPoint: false,
  partialPoints: true,
};

const evidence2005 = highEvidence("2005 completed-season results; estimated unsupported traits are labeled");
const drivers2005: Driver[] = [
  driver(2005, "ALO", "Fernando", "Alonso", 5, "ESP", 24, 96, evidence2005, { consistency: 98, wetWeather: 94 }),
  driver(2005, "FIS", "Giancarlo", "Fisichella", 6, "ITA", 32, 86, evidence2005),
  driver(2005, "RAI", "Kimi", "Raikkonen", 9, "FIN", 26, 97, evidence2005, { qualifyingPace: 98, racePace: 98, consistency: 91 }),
  driver(2005, "MON", "Juan Pablo", "Montoya", 10, "COL", 30, 91, evidence2005, { overtaking: 95, consistency: 85 }),
  driver(2005, "MSC", "Michael", "Schumacher", 1, "DEU", 36, 94, evidence2005, { experience: 100, wetWeather: 98 }),
  driver(2005, "BAR", "Rubens", "Barrichello", 2, "BRA", 33, 89, evidence2005),
  driver(2005, "BUT", "Jenson", "Button", 3, "GBR", 25, 91, evidence2005, { tireManagement: 95 }),
  driver(2005, "SAT", "Takuma", "Sato", 4, "JPN", 28, 79, evidence2005, { overtaking: 86, consistency: 69 }),
  driver(2005, "WEB", "Mark", "Webber", 7, "AUS", 29, 87, evidence2005, { qualifyingPace: 91 }),
  driver(2005, "HEI", "Nick", "Heidfeld", 8, "DEU", 28, 86, evidence2005, { consistency: 91 }),
  driver(2005, "TRU", "Jarno", "Trulli", 16, "ITA", 31, 87, evidence2005, { qualifyingPace: 94, racePace: 83 }),
  driver(2005, "RSC", "Ralf", "Schumacher", 17, "DEU", 30, 85, evidence2005),
  driver(2005, "COU", "David", "Coulthard", 14, "GBR", 34, 85, evidence2005, { experience: 96 }),
  driver(2005, "KLI", "Christian", "Klien", 15, "AUT", 22, 76, evidence2005),
  driver(2005, "MAS", "Felipe", "Massa", 12, "BRA", 24, 82, evidence2005, { qualifyingPace: 86 }),
  driver(2005, "VIL", "Jacques", "Villeneuve", 11, "CAN", 34, 78, evidence2005, { experience: 94 }),
  driver(2005, "MONF", "Tiago", "Monteiro", 18, "PRT", 29, 70, evidence2005, { consistency: 78 }),
  driver(2005, "KAR", "Narain", "Karthikeyan", 19, "IND", 28, 67, evidence2005),
  driver(2005, "ALB", "Christijan", "Albers", 20, "NLD", 26, 68, evidence2005),
  driver(2005, "FRI", "Patrick", "Friesacher", 21, "AUT", 24, 65, evidence2005),
];
const teams2005: Team[] = [
  team(2005, "renault", "Renault", "REN", "#f4d13d", ["ALO", "FIS"], 94, evidence2005, { reliability: 97 }),
  team(2005, "mclaren", "McLaren Mercedes", "MCL", "#a7a9ac", ["RAI", "MON"], 97, evidence2005, { reliability: 82, power: 99 }),
  team(2005, "ferrari", "Ferrari", "FER", "#dc1e28", ["MSC", "BAR"], 88, evidence2005),
  team(2005, "bar", "BAR Honda", "BAR", "#d9d9d9", ["BUT", "SAT"], 86, evidence2005),
  team(2005, "williams", "Williams BMW", "WIL", "#2e60a8", ["WEB", "HEI"], 85, evidence2005),
  team(2005, "toyota", "Toyota", "TOY", "#ef3340", ["TRU", "RSC"], 84, evidence2005),
  team(2005, "red-bull", "Red Bull Racing", "RBR", "#2446a8", ["COU", "KLI"], 77, evidence2005),
  team(2005, "sauber", "Sauber Petronas", "SAU", "#2e8a63", ["MAS", "VIL"], 75, evidence2005),
  team(2005, "jordan", "Jordan Toyota", "JOR", "#f5c842", ["MONF", "KAR"], 61, evidence2005),
  team(2005, "minardi", "Minardi Cosworth", "MIN", "#20242a", ["ALB", "FRI"], 58, evidence2005),
];

const sharedCircuits: Circuit[] = [
  circuit("melbourne", "Albert Park", "Australia", "Melbourne", 58, "balanced", 44),
  circuit("shanghai", "Shanghai International Circuit", "China", "Shanghai", 56, "balanced", 45),
  circuit("suzuka", "Suzuka Circuit", "Japan", "Suzuka", 53, "aero", 48),
  circuit("bahrain", "Bahrain International Circuit", "Bahrain", "Sakhir", 57, "power", 8),
  circuit("monaco", "Circuit de Monaco", "Monaco", "Monte Carlo", 78, "street", 35),
  circuit("barcelona", "Circuit de Barcelona-Catalunya", "Spain", "Barcelona", 66, "aero", 18),
  circuit("montreal", "Circuit Gilles Villeneuve", "Canada", "Montreal", 70, "power", 52),
  circuit("silverstone", "Silverstone Circuit", "Great Britain", "Silverstone", 52, "aero", 62),
  circuit("spa", "Circuit de Spa-Francorchamps", "Belgium", "Spa", 44, "power", 88),
  circuit("hungaroring", "Hungaroring", "Hungary", "Budapest", 70, "aero", 52),
  circuit("monza", "Autodromo Nazionale Monza", "Italy", "Monza", 53, "power", 39),
  circuit("interlagos", "Interlagos", "Brazil", "Sao Paulo", 71, "balanced", 72),
];

const circuits2005: Circuit[] = [
  ...sharedCircuits,
  circuit("sepang", "Sepang International Circuit", "Malaysia", "Kuala Lumpur", 56, "balanced", 82),
  circuit("imola", "Autodromo Enzo e Dino Ferrari", "San Marino", "Imola", 62, "aero", 38),
  circuit("nurburgring", "Nurburgring GP-Strecke", "Germany", "Nurburg", 60, "balanced", 58),
  circuit("indianapolis", "Indianapolis Motor Speedway", "United States", "Indianapolis", 73, "power", 50),
  circuit("magny-cours", "Circuit de Nevers Magny-Cours", "France", "Magny-Cours", 70, "balanced", 42),
  circuit("hockenheim", "Hockenheimring", "Germany", "Hockenheim", 67, "power", 45),
  circuit("istanbul", "Istanbul Park", "Turkey", "Istanbul", 58, "aero", 35),
];
const weekends2005 = weekends(2005, [
  ["Australian Grand Prix", "melbourne"], ["Malaysian Grand Prix", "sepang"], ["Bahrain Grand Prix", "bahrain"], ["San Marino Grand Prix", "imola"],
  ["Spanish Grand Prix", "barcelona"], ["Monaco Grand Prix", "monaco"], ["European Grand Prix", "nurburgring"], ["Canadian Grand Prix", "montreal"],
  ["United States Grand Prix", "indianapolis"], ["French Grand Prix", "magny-cours"], ["British Grand Prix", "silverstone"], ["German Grand Prix", "hockenheim"],
  ["Hungarian Grand Prix", "hungaroring"], ["Turkish Grand Prix", "istanbul"], ["Italian Grand Prix", "monza"], ["Belgian Grand Prix", "spa"],
  ["Brazilian Grand Prix", "interlagos"], ["Japanese Grand Prix", "suzuka"], ["Chinese Grand Prix", "shanghai"],
]);

const rules2026: Ruleset = {
  id: "rules-2026",
  name: "2026 major-era rules",
  year: 2026,
  points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1].map((points, index) => ({ position: index + 1, points })),
  sprintPoints: [8, 7, 6, 5, 4, 3, 2, 1].map((points, index) => ({ position: index + 1, points })),
  constructorsChampionship: true,
  qualifyingFormat: "knockout",
  refueling: false,
  tireChanges: "required-dry-compounds",
  safetyCar: true,
  fastestLapPoint: false,
  partialPoints: true,
};

const evidence2026 = mediumEvidence("Official 2026 grid and calendar; ratings are a dated rolling blend");
const drivers2026: Driver[] = [
  driver(2026, "RUS", "George", "Russell", 63, "GBR", 28, 93, evidence2026, { consistency: 95 }),
  driver(2026, "ANT", "Kimi", "Antonelli", 12, "ITA", 20, 94, evidence2026, { qualifyingPace: 95 }),
  driver(2026, "LEC", "Charles", "Leclerc", 16, "MCO", 28, 93, evidence2026, { qualifyingPace: 97 }),
  driver(2026, "HAM", "Lewis", "Hamilton", 44, "GBR", 41, 91, evidence2026, { experience: 100, wetWeather: 98, tireManagement: 96 }),
  driver(2026, "NOR", "Lando", "Norris", 1, "GBR", 26, 94, evidence2026, { consistency: 95 }),
  driver(2026, "PIA", "Oscar", "Piastri", 81, "AUS", 25, 93, evidence2026, { consistency: 95 }),
  driver(2026, "VER", "Max", "Verstappen", 3, "NLD", 28, 98, evidence2026, { wetWeather: 100, racePace: 100, consistency: 98 }),
  driver(2026, "HAD", "Isack", "Hadjar", 6, "FRA", 21, 88, evidence2026, { qualifyingPace: 90 }),
  driver(2026, "LAW", "Liam", "Lawson", 30, "NZL", 24, 82, evidence2026),
  driver(2026, "LIN", "Arvid", "Lindblad", 41, "GBR", 19, 81, evidence2026, { experience: 64 }),
  driver(2026, "GAS", "Pierre", "Gasly", 10, "FRA", 30, 87, evidence2026),
  driver(2026, "COL", "Franco", "Colapinto", 43, "ARG", 23, 79, evidence2026),
  driver(2026, "OCO", "Esteban", "Ocon", 31, "FRA", 29, 84, evidence2026),
  driver(2026, "BEA", "Oliver", "Bearman", 87, "GBR", 21, 84, evidence2026),
  driver(2026, "HUL", "Nico", "Hulkenberg", 27, "DEU", 39, 86, evidence2026, { experience: 98 }),
  driver(2026, "BOR", "Gabriel", "Bortoleto", 5, "BRA", 21, 83, evidence2026),
  driver(2026, "SAI", "Carlos", "Sainz", 55, "ESP", 32, 89, evidence2026, { consistency: 92 }),
  driver(2026, "ALB", "Alexander", "Albon", 23, "THA", 30, 87, evidence2026),
  driver(2026, "ALO", "Fernando", "Alonso", 14, "ESP", 45, 91, evidence2026, { experience: 100, racePace: 94 }),
  driver(2026, "STR", "Lance", "Stroll", 18, "CAN", 27, 77, evidence2026),
  driver(2026, "PER", "Sergio", "Perez", 11, "MEX", 36, 84, evidence2026, { tireManagement: 91 }),
  driver(2026, "BOT", "Valtteri", "Bottas", 77, "FIN", 37, 83, evidence2026, { qualifyingPace: 87 }),
];
const teams2026: Team[] = [
  team(2026, "mercedes", "Mercedes", "MER", "#00a19b", ["RUS", "ANT"], 95, evidence2026, { reliability: 96 }),
  team(2026, "ferrari", "Ferrari", "FER", "#e80020", ["LEC", "HAM"], 92, evidence2026),
  team(2026, "mclaren", "McLaren", "MCL", "#ff8700", ["NOR", "PIA"], 91, evidence2026, { strategy: 94 }),
  team(2026, "red-bull", "Red Bull Racing", "RBR", "#3671c6", ["VER", "HAD"], 89, evidence2026, { aerodynamics: 94 }),
  team(2026, "racing-bulls", "Racing Bulls", "VCB", "#6692ff", ["LAW", "LIN"], 78, evidence2026),
  team(2026, "alpine", "Alpine", "ALP", "#0093cc", ["GAS", "COL"], 72, evidence2026),
  team(2026, "haas", "Haas F1 Team", "HAS", "#b6babd", ["OCO", "BEA"], 77, evidence2026),
  team(2026, "audi", "Audi", "AUD", "#d31338", ["HUL", "BOR"], 83, evidence2026, { developmentPotential: 90 }),
  team(2026, "williams", "Williams", "WIL", "#1868db", ["SAI", "ALB"], 82, evidence2026),
  team(2026, "aston-martin", "Aston Martin", "AMR", "#229971", ["ALO", "STR"], 75, evidence2026, { developmentPotential: 91 }),
  team(2026, "cadillac", "Cadillac", "CAD", "#b9a56a", ["PER", "BOT"], 70, evidence2026, { developmentPotential: 86 }),
];

const circuits2026: Circuit[] = [
  ...sharedCircuits,
  circuit("jeddah", "Jeddah Corniche Circuit", "Saudi Arabia", "Jeddah", 50, "street", 5),
  circuit("miami", "Miami International Autodrome", "United States", "Miami", 57, "street", 48),
  circuit("red-bull-ring", "Red Bull Ring", "Austria", "Spielberg", 71, "power", 50),
  circuit("zandvoort", "Circuit Zandvoort", "Netherlands", "Zandvoort", 72, "aero", 66),
  circuit("madrid", "Madring", "Spain", "Madrid", 57, "street", 20),
  circuit("baku", "Baku City Circuit", "Azerbaijan", "Baku", 51, "street", 18),
  circuit("singapore", "Marina Bay Street Circuit", "Singapore", "Singapore", 62, "street", 76),
  circuit("austin", "Circuit of the Americas", "United States", "Austin", 56, "balanced", 44),
  circuit("mexico", "Autodromo Hermanos Rodriguez", "Mexico", "Mexico City", 71, "power", 48),
  circuit("las-vegas", "Las Vegas Strip Circuit", "United States", "Las Vegas", 50, "street", 8),
  circuit("lusail", "Lusail International Circuit", "Qatar", "Lusail", 57, "aero", 5),
  circuit("yas-marina", "Yas Marina Circuit", "United Arab Emirates", "Abu Dhabi", 58, "balanced", 3),
];
const weekends2026 = weekends(2026, [
  ["Australian Grand Prix", "melbourne"], ["Chinese Grand Prix", "shanghai", true], ["Japanese Grand Prix", "suzuka"], ["Bahrain Grand Prix", "bahrain"],
  ["Saudi Arabian Grand Prix", "jeddah"], ["Miami Grand Prix", "miami", true], ["Canadian Grand Prix", "montreal", true], ["Monaco Grand Prix", "monaco"],
  ["Barcelona Grand Prix", "barcelona"], ["Austrian Grand Prix", "red-bull-ring"], ["British Grand Prix", "silverstone", true], ["Belgian Grand Prix", "spa"],
  ["Hungarian Grand Prix", "hungaroring"], ["Dutch Grand Prix", "zandvoort", true], ["Italian Grand Prix", "monza"], ["Spanish Grand Prix", "madrid"],
  ["Azerbaijan Grand Prix", "baku"], ["Singapore Grand Prix", "singapore", true], ["United States Grand Prix", "austin"], ["Mexico City Grand Prix", "mexico"],
  ["Sao Paulo Grand Prix", "interlagos"], ["Las Vegas Grand Prix", "las-vegas"], ["Qatar Grand Prix", "lusail"], ["Abu Dhabi Grand Prix", "yas-marina"],
]);

export const PRESET_2005: SeasonPreset = {
  id: "preset-2005-v1",
  year: 2005,
  name: "2005 championship",
  sourceSnapshotId: "bundled-2005-v1",
  sourceNote: "Completed-season evidence with normalized two-car entries and editable estimated ratings.",
  ruleset: rules2005,
  drivers: drivers2005,
  teams: teams2005,
  circuits: circuits2005,
  weekends: weekends2005,
  contracts: contractsFor(2005, teams2005, drivers2005),
};

export const PRESET_2026: SeasonPreset = {
  id: "preset-2026-2026-09-11",
  year: 2026,
  name: "2026 current championship",
  sourceSnapshotId: "bundled-2026-2026-09-11",
  sourceNote: "Official grid/calendar snapshot dated 2026-09-11; ratings are editable rolling estimates.",
  ruleset: rules2026,
  drivers: drivers2026,
  teams: teams2026,
  circuits: circuits2026,
  weekends: weekends2026,
  contracts: contractsFor(2026, teams2026, drivers2026),
};

export const BUILT_IN_PRESETS: SeasonPreset[] = [PRESET_2005, PRESET_2026];

export function getPreset(id: string): SeasonPreset | undefined {
  return BUILT_IN_PRESETS.find((preset) => preset.id === id);
}

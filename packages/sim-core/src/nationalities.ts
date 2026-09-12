import type { DeterministicRng } from "./rng";

export interface NationalityProfile {
  code: string;
  country: string;
  nationality: string;
  generationWeight: number;
  firstNames: readonly string[];
  lastNames: readonly string[];
}

const entry = (
  code: string,
  country: string,
  nationality: string,
  generationWeight: number,
  firstNames: readonly string[],
  lastNames: readonly string[],
): NationalityProfile => ({ code, country, nationality, generationWeight, firstNames, lastNames });

/**
 * Configurable identity data for generated drivers. The default weights model
 * frequency only: none of these records is visible to the talent generator.
 */
export const GLOBAL_NATIONALITY_PROFILES: readonly NationalityProfile[] = [
  entry("ARG", "Argentina", "Argentine", 2, ["Mateo", "Tomas", "Santino", "Valentina"], ["Acosta", "Benitez", "Fernandez", "Romero"]),
  entry("AUS", "Australia", "Australian", 4, ["Jack", "Liam", "Oscar", "Sophie"], ["Campbell", "Harris", "Mitchell", "Walker"]),
  entry("AUT", "Austria", "Austrian", 2, ["Felix", "Jonas", "Lukas", "Mia"], ["Gruber", "Hofer", "Leitner", "Wagner"]),
  entry("BEL", "Belgium", "Belgian", 2, ["Arthur", "Jules", "Noa", "Senne"], ["Claes", "Dubois", "Maes", "Peeters"]),
  entry("BRA", "Brazil", "Brazilian", 7, ["Caio", "Enzo", "Joao", "Marina"], ["Almeida", "Costa", "Oliveira", "Silva"]),
  entry("CAN", "Canada", "Canadian", 4, ["Ethan", "Felix", "Laurent", "Maya"], ["Beaulieu", "Bouchard", "Martin", "Wilson"]),
  entry("CHE", "Switzerland", "Swiss", 2, ["Elia", "Luca", "Nico", "Sofia"], ["Baumann", "Frei", "Meier", "Rossi"]),
  entry("CHL", "Chile", "Chilean", 2, ["Benjamin", "Gaspar", "Martin", "Renata"], ["Contreras", "Fuentes", "Rojas", "Valdes"]),
  entry("CHN", "China", "Chinese", 4, ["Hao", "Jun", "Wei", "Xinyi"], ["Chen", "Li", "Wang", "Zhang"]),
  entry("COL", "Colombia", "Colombian", 2, ["Emiliano", "Juan", "Santiago", "Valeria"], ["Gomez", "Ramirez", "Restrepo", "Torres"]),
  entry("CRI", "Costa Rica", "Costa Rican", 1, ["Andres", "Daniel", "Mateo", "Sofia"], ["Calderon", "Mora", "Quesada", "Vargas"]),
  entry("CZE", "Czechia", "Czech", 1, ["Adam", "Jakub", "Matej", "Tereza"], ["Dvorak", "Kral", "Novak", "Svoboda"]),
  entry("DEU", "Germany", "German", 7, ["Emil", "Finn", "Jonas", "Lina"], ["Becker", "Hoffmann", "Keller", "Weber"]),
  entry("DNK", "Denmark", "Danish", 3, ["Emil", "Frederik", "Mikkel", "Sofie"], ["Andersen", "Jensen", "Larsen", "Nielsen"]),
  entry("ECU", "Ecuador", "Ecuadorian", 1, ["Alejandro", "Emilio", "Nicolas", "Camila"], ["Cevallos", "Mendoza", "Paredes", "Viteri"]),
  entry("EGY", "Egypt", "Egyptian", 2, ["Karim", "Omar", "Youssef", "Nour"], ["El-Sayed", "Hassan", "Mansour", "Mostafa"]),
  entry("ESP", "Spain", "Spanish", 7, ["Alejandro", "Hugo", "Marc", "Lucia"], ["Alonso", "Navarro", "Ortega", "Vidal"]),
  entry("EST", "Estonia", "Estonian", 1, ["Karl", "Markus", "Rasmus", "Liis"], ["Kask", "Pärn", "Saar", "Tamm"]),
  entry("FIN", "Finland", "Finnish", 4, ["Elias", "Onni", "Tuomas", "Aino"], ["Heikkinen", "Korhonen", "Laine", "Mäkinen"]),
  entry("FRA", "France", "French", 8, ["Arthur", "Hugo", "Mathis", "Camille"], ["Bernard", "Lefevre", "Martel", "Roux"]),
  entry("GBR", "United Kingdom", "British", 12, ["George", "Oliver", "Theo", "Imani"], ["Clarke", "Evans", "Price", "Taylor"]),
  entry("GRC", "Greece", "Greek", 1, ["Andreas", "Dimitris", "Nikos", "Eleni"], ["Georgiou", "Nikolaidis", "Papadopoulos", "Vlachos"]),
  entry("HRV", "Croatia", "Croatian", 1, ["Ivan", "Luka", "Matej", "Petra"], ["Horvat", "Kovacic", "Maric", "Novak"]),
  entry("HUN", "Hungary", "Hungarian", 2, ["Bence", "Levente", "Mate", "Lili"], ["Farkas", "Kovacs", "Nagy", "Szabo"]),
  entry("IDN", "Indonesia", "Indonesian", 3, ["Aditya", "Bima", "Raka", "Putri"], ["Halim", "Pratama", "Santoso", "Wijaya"]),
  entry("IND", "India", "Indian", 5, ["Aarav", "Arjun", "Rohan", "Anaya"], ["Kapoor", "Mehta", "Patel", "Singh"]),
  entry("IRL", "Ireland", "Irish", 2, ["Cian", "Finn", "Ronan", "Aoife"], ["Byrne", "Kelly", "Murphy", "O'Connor"]),
  entry("ISL", "Iceland", "Icelandic", 1, ["Aron", "Einar", "Viktor", "Katrin"], ["Einarsson", "Jónsson", "Magnusson", "Sigurdsson"]),
  entry("ISR", "Israel", "Israeli", 1, ["Daniel", "Eitan", "Noam", "Yael"], ["Cohen", "Levi", "Mizrahi", "Shalev"]),
  entry("ITA", "Italy", "Italian", 10, ["Alessandro", "Lorenzo", "Matteo", "Giulia"], ["Bellini", "Conti", "Moretti", "Romano"]),
  entry("JPN", "Japan", "Japanese", 7, ["Haruto", "Kaito", "Ren", "Aoi"], ["Kobayashi", "Nakamura", "Sato", "Tanaka"]),
  entry("KEN", "Kenya", "Kenyan", 2, ["Daniel", "Kamau", "Otieno", "Wanjiku"], ["Kiptoo", "Mwangi", "Njoroge", "Odhiambo"]),
  entry("KOR", "South Korea", "South Korean", 2, ["Do-yun", "Ji-ho", "Min-jun", "Seo-yeon"], ["Choi", "Kim", "Lee", "Park"]),
  entry("LTU", "Lithuania", "Lithuanian", 1, ["Domas", "Jonas", "Matas", "Emilija"], ["Jankauskas", "Kazlauskas", "Petrauskas", "Vaitkus"]),
  entry("LVA", "Latvia", "Latvian", 1, ["Arturs", "Janis", "Karlis", "Elina"], ["Berzins", "Kalnins", "Ozols", "Vitols"]),
  entry("MAR", "Morocco", "Moroccan", 2, ["Amine", "Ilyas", "Youssef", "Salma"], ["Alaoui", "Bennani", "El Idrissi", "Tahiri"]),
  entry("MCO", "Monaco", "Monegasque", 1, ["Alexandre", "Jules", "Louis", "Charlotte"], ["Blanc", "Lorenzi", "Pastor", "Rossi"]),
  entry("MEX", "Mexico", "Mexican", 5, ["Diego", "Emiliano", "Santiago", "Sofia"], ["Cervantes", "Ibarra", "Lozano", "Reyes"]),
  entry("MYS", "Malaysia", "Malaysian", 2, ["Aiman", "Danish", "Hafiz", "Alya"], ["Abdullah", "Ismail", "Rahman", "Tan"]),
  entry("NGA", "Nigeria", "Nigerian", 3, ["Chidi", "Emeka", "Tobi", "Amara"], ["Adebayo", "Eze", "Okafor", "Olawale"]),
  entry("NLD", "Netherlands", "Dutch", 5, ["Daan", "Jesse", "Sem", "Lotte"], ["Bakker", "De Vries", "Smit", "Van Dijk"]),
  entry("NOR", "Norway", "Norwegian", 3, ["Emil", "Henrik", "Sander", "Ingrid"], ["Berg", "Haugen", "Johansen", "Lund"]),
  entry("NZL", "New Zealand", "New Zealander", 3, ["Finn", "Lachlan", "Noah", "Maia"], ["Cooper", "King", "Rangi", "Wilson"]),
  entry("PAN", "Panama", "Panamanian", 1, ["Adrian", "Gabriel", "Mateo", "Isabella"], ["Castillo", "Moreno", "Pineda", "Tejada"]),
  entry("PER", "Peru", "Peruvian", 2, ["Adrian", "Joaquin", "Sebastian", "Valentina"], ["Caceres", "Huaman", "Salazar", "Vargas"]),
  entry("PHL", "Philippines", "Filipino", 3, ["Andres", "Gabriel", "Miguel", "Mikaela"], ["Bautista", "Dela Cruz", "Manalo", "Reyes"]),
  entry("POL", "Poland", "Polish", 3, ["Jakub", "Kacper", "Mikolaj", "Zofia"], ["Kowalski", "Nowak", "Wojcik", "Zielinski"]),
  entry("PRT", "Portugal", "Portuguese", 3, ["Afonso", "Duarte", "Tiago", "Ines"], ["Carvalho", "Ferreira", "Pereira", "Sousa"]),
  entry("QAT", "Qatar", "Qatari", 1, ["Hamad", "Khalid", "Nasser", "Mariam"], ["Al-Kuwari", "Al-Mohannadi", "Al-Sulaiti", "Al-Thani"]),
  entry("ROU", "Romania", "Romanian", 1, ["Andrei", "Matei", "Radu", "Ioana"], ["Ionescu", "Popescu", "Radu", "Stan"]),
  entry("SAU", "Saudi Arabia", "Saudi", 2, ["Fahad", "Omar", "Saud", "Noura"], ["Al-Dosari", "Al-Harbi", "Al-Qahtani", "Al-Shehri"]),
  entry("SGP", "Singapore", "Singaporean", 2, ["Ethan", "Jian", "Ryan", "Mei"], ["Lim", "Ng", "Tan", "Wong"]),
  entry("SRB", "Serbia", "Serbian", 1, ["Luka", "Marko", "Nikola", "Milica"], ["Jovanovic", "Nikolic", "Petrovic", "Stojanovic"]),
  entry("SVK", "Slovakia", "Slovak", 1, ["Adam", "Martin", "Samuel", "Nina"], ["Horvath", "Kovac", "Novak", "Varga"]),
  entry("SVN", "Slovenia", "Slovenian", 1, ["Jan", "Luka", "Zan", "Nika"], ["Kovac", "Kranjc", "Novak", "Zupan"]),
  entry("SWE", "Sweden", "Swedish", 3, ["Elias", "Hugo", "Viggo", "Elsa"], ["Bergström", "Lind", "Nilsson", "Sjöberg"]),
  entry("THA", "Thailand", "Thai", 3, ["Aran", "Kiet", "Niran", "Pim"], ["Chaiyaporn", "Srisuk", "Suwan", "Wongchai"]),
  entry("TUR", "Türkiye", "Turkish", 2, ["Arda", "Emir", "Kerem", "Defne"], ["Aydin", "Demir", "Kaya", "Yilmaz"]),
  entry("UKR", "Ukraine", "Ukrainian", 2, ["Andriy", "Maksym", "Oleksii", "Sofiia"], ["Bondarenko", "Koval", "Melnyk", "Shevchenko"]),
  entry("URY", "Uruguay", "Uruguayan", 1, ["Facundo", "Joaquin", "Santiago", "Martina"], ["Cabrera", "Pereira", "Rodriguez", "Silva"]),
  entry("USA", "United States", "American", 9, ["Aiden", "Logan", "Mason", "Avery"], ["Brooks", "Carter", "Reed", "Turner"]),
  entry("VEN", "Venezuela", "Venezuelan", 1, ["Diego", "Gabriel", "Santiago", "Victoria"], ["Farias", "Marquez", "Salcedo", "Torres"]),
  entry("VNM", "Vietnam", "Vietnamese", 2, ["Bao", "Minh", "Quang", "Linh"], ["Le", "Nguyen", "Pham", "Tran"]),
  entry("ZAF", "South Africa", "South African", 3, ["Caleb", "Liam", "Thabo", "Naledi"], ["Botha", "Dlamini", "Naidoo", "Van Wyk"]),
];

export interface GeneratedIdentity {
  givenName: string;
  familyName: string;
  nationality: string;
  countryCode: string;
}

export function nationalityProfileByCode(code: string, profiles = GLOBAL_NATIONALITY_PROFILES): NationalityProfile | undefined {
  return profiles.find((profile) => profile.code === code.toUpperCase());
}

export function selectNationalityProfile(
  rng: DeterministicRng,
  configuredWeights: Readonly<Record<string, number>> = {},
  profiles: readonly NationalityProfile[] = GLOBAL_NATIONALITY_PROFILES,
): NationalityProfile {
  if (profiles.length === 0) throw new Error("At least one nationality profile is required.");
  const weights = profiles.map((profile) => {
    const configured = configuredWeights[profile.code];
    return Math.max(0, Number.isFinite(configured) ? configured! : profile.generationWeight);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return profiles[rng.int(0, profiles.length - 1)]!;
  let roll = rng.between(0, total);
  for (let index = 0; index < profiles.length; index += 1) {
    roll -= weights[index]!;
    if (roll <= 0) return profiles[index]!;
  }
  return profiles.at(-1)!;
}

export function generateIdentity(rng: DeterministicRng, profile: NationalityProfile): GeneratedIdentity {
  return {
    givenName: rng.pick(profile.firstNames),
    familyName: rng.pick(profile.lastNames),
    nationality: profile.nationality,
    countryCode: profile.code,
  };
}

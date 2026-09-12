import { describe, expect, it } from "vitest";
import {
  advanceJuniorEcosystem,
  calculateCareerOverall,
  developDriverCareer,
  enforceCareerPopulationCaps,
  evaluateRetirement,
  generateProspect,
  generateProspectClass,
} from "./career";
import { createDefaultWorldConfig } from "./config";
import { normalizeTeamDefaults } from "./defaults";
import { GLOBAL_NATIONALITY_PROFILES, nationalityProfileByCode } from "./nationalities";
import { PRESET_2026 } from "./presets";
import type { JuniorState, NormalizedDriver } from "./types";

const config = createDefaultWorldConfig();

function teams() {
  return PRESET_2026.teams.slice(0, 4).map((team, index, source) => normalizeTeamDefaults(team, 2026, index + 1, source.length));
}

function coreTalent(driver: NormalizedDriver) {
  return {
    ratings: driver.ratings,
    advancedRatings: driver.advancedRatings,
    potential: driver.potential,
    potentialMin: driver.potentialMin,
    potentialMax: driver.potentialMax,
    developmentRate: driver.developmentRate,
    archetype: driver.archetype,
    personality: driver.personality,
    backing: driver.financialBackingCredits,
  };
}

describe("procedural careers", () => {
  it("generates deterministic, bounded, archetype-correlated prospects", () => {
    const first = generateProspect({ seed: 8128, season: 2034, index: 4, config });
    const second = generateProspect({ seed: 8128, season: 2034, index: 4, config });
    expect(first).toEqual(second);
    expect(first.generatedDriver).toBe(true);
    expect(first.status).toBe("f3");
    expect(first.givenName).toBeTruthy();
    expect(first.familyName).toBeTruthy();
    expect(first.countryCode).toHaveLength(3);
    expect(first.potentialMin).toBeLessThanOrEqual(first.potential);
    expect(first.potentialMax).toBeGreaterThanOrEqual(first.potential);
    expect([...Object.values(first.ratings), ...Object.values(first.advancedRatings)].every((value) => value >= 0 && value <= 100)).toBe(true);
    if (first.archetype === "qualifying-specialist") {
      expect(first.ratings.qualifyingPace).toBeGreaterThan(first.ratings.consistency - 3);
    }
  });

  it("keeps identity selection completely separate from talent and personality", () => {
    const philippines = nationalityProfileByCode("PHL")!;
    const kenya = nationalityProfileByCode("KEN")!;
    const filipino = generateProspect({ seed: 99, season: 2040, index: 2, config, nationalityProfiles: [philippines] });
    const kenyan = generateProspect({ seed: 99, season: 2040, index: 2, config, nationalityProfiles: [kenya] });
    expect(filipino.countryCode).toBe("PHL");
    expect(kenyan.countryCode).toBe("KEN");
    expect(filipino.nationality).not.toBe(kenyan.nationality);
    expect(coreTalent(filipino)).toEqual(coreTalent(kenyan));
  });

  it("makes every configured country eligible without coupling country to potential", () => {
    expect(GLOBAL_NATIONALITY_PROFILES.length).toBeGreaterThanOrEqual(50);
    const generatedCodes = GLOBAL_NATIONALITY_PROFILES.map((profile, index) => generateProspect({
      seed: 410,
      season: 2050,
      index,
      config,
      nationalityProfiles: [profile],
    }).countryCode);
    expect(new Set(generatedCodes)).toEqual(new Set(GLOBAL_NATIONALITY_PROFILES.map((profile) => profile.code)));
    expect(generatedCodes).toContain("PHL");
    expect(generatedCodes).toContain("KEN");
  });

  it("uses a centered potential distribution with rare elite prospects", () => {
    const potentials = Array.from({ length: 2_000 }, (_, index) => generateProspect({ seed: 7001, season: 2060, index, config }).potential);
    const centralShare = potentials.filter((potential) => potential >= 70 && potential <= 89).length / potentials.length;
    const eliteShare = potentials.filter((potential) => potential >= 95).length / potentials.length;
    expect(centralShare).toBeGreaterThan(0.65);
    expect(eliteShare).toBeGreaterThan(0.015);
    expect(eliteShare).toBeLessThan(0.08);
  });

  it("grows high-potential youth, declines veterans, and respects rating caps", () => {
    const young = generateProspect({ seed: 12, season: 2027, index: 0, config });
    young.age = 18;
    young.potential = 98;
    young.developmentRate = config.development.maximumRate;
    young.personality.workEthic = 96;
    for (const field of Object.keys(young.ratings) as Array<keyof typeof young.ratings>) young.ratings[field] = 58;
    for (const field of Object.keys(young.advancedRatings) as Array<keyof typeof young.advancedRatings>) young.advancedRatings[field] = 58;

    const veteran = structuredClone(young);
    veteran.id = "generated-veteran-test";
    veteran.age = 40;
    veteran.status = "f1";
    veteran.archetype = "veteran-leader";
    veteran.potential = 96;
    for (const field of Object.keys(veteran.ratings) as Array<keyof typeof veteran.ratings>) veteran.ratings[field] = 90;
    for (const field of Object.keys(veteran.advancedRatings) as Array<keyof typeof veteran.advancedRatings>) veteran.advancedRatings[field] = 90;

    const developed = developDriverCareer(young, { seed: 44, season: 2027, config });
    const declined = developDriverCareer(veteran, { seed: 44, season: 2027, config });
    expect(developed.driver.age).toBe(19);
    expect(developed.overallDelta).toBeGreaterThan(0);
    expect(declined.driver.age).toBe(41);
    expect(declined.overallDelta).toBeLessThan(0);
    expect(Math.abs(developed.overallDelta)).toBeLessThanOrEqual(config.development.maximumYearlyOverallChange + 0.15);
    expect(Math.abs(declined.overallDelta)).toBeLessThanOrEqual(config.development.maximumYearlyOverallChange + 0.15);
    expect([...Object.values(developed.driver.ratings), ...Object.values(declined.driver.ratings)].every((value) => value >= 0 && value <= 100)).toBe(true);
  });

  it("keeps young drivers active and lets strong offers reduce veteran retirement risk", () => {
    const young = generateProspect({ seed: 19, season: 2030, index: 0, config });
    const protectedDecision = evaluateRetirement(young, { seed: 90, season: 2030, config });
    expect(protectedDecision.probability).toBe(0);
    expect(protectedDecision.retire).toBe(false);

    const veteran = structuredClone(young);
    veteran.id = "retirement-veteran";
    veteran.age = 42;
    veteran.status = "free-agent";
    veteran.morale = 38;
    const withoutOffer = evaluateRetirement(veteran, { seed: 90, season: 2030, config, yearsWithoutF1Seat: 2, recentOverallDelta: -2 });
    const withOffer = evaluateRetirement(veteran, { seed: 90, season: 2030, config, yearsWithoutF1Seat: 0, recentOverallDelta: -2, competitiveOfferScore: 95 });
    expect(withoutOffer.probability).toBeGreaterThan(withOffer.probability);
    expect(withoutOffer.probability).toBeGreaterThan(0.4);
    expect(withOffer.reasons.join(" ")).toMatch(/competitive offer/i);
  });
});

describe("junior ecosystem", () => {
  function fixture() {
    const f3 = generateProspectClass({ seed: 100, season: 2031, count: 18, config });
    const f2 = generateProspectClass({ seed: 200, season: 2030, count: 12, config, status: "f2", existingDriverIds: f3.map((driver) => driver.id), existingNumbers: f3.map((driver) => driver.number) });
    f2.forEach((driver) => { driver.age = Math.max(18, driver.age); });
    const gridTeams = teams();
    const juniorState: JuniorState = {
      season: 2031,
      f3DriverIds: f3.map((driver) => driver.id),
      f2DriverIds: f2.map((driver) => driver.id),
      reserveDriverIds: [],
      academyDriverIdsByTeam: Object.fromEntries(gridTeams.map((team, index) => [team.id, index < 2 ? [f3[index]!.id, f2[index]!.id] : []])),
      incomingClassDriverIds: [],
    };
    return { drivers: [...f3, ...f2], gridTeams, juniorState };
  }

  it("produces deterministic standings, promotions, graduates, and a new intake", () => {
    const data = fixture();
    const input = { seed: 900, season: 2031, config, drivers: data.drivers, teams: data.gridTeams, juniorState: data.juniorState };
    const first = advanceJuniorEcosystem(input);
    const second = advanceJuniorEcosystem(input);
    expect(first).toEqual(second);
    expect(first.f3Standings).toHaveLength(18);
    expect(first.f2Standings).toHaveLength(12);
    expect(first.promotedToF2DriverIds.length).toBeGreaterThan(0);
    expect(first.graduatedDriverIds.length).toBeGreaterThan(0);
    expect(first.incomingDriverIds).toHaveLength(config.generation.f3PerSeason);
    expect(first.juniorState.season).toBe(2032);
    expect(new Set(first.drivers.map((driver) => driver.id)).size).toBe(first.drivers.length);
    expect(first.graduatedDriverIds.every((id) => ["reserve", "free-agent"].includes(first.drivers.find((driver) => driver.id === id)!.status))).toBe(true);
  });

  it("enforces live population caps without touching active F1 drivers", () => {
    const data = fixture();
    const active = structuredClone(data.drivers[0]!);
    active.id = "protected-f1-driver";
    active.status = "f1";
    const crowded = [...data.drivers, active];
    const capped = enforceCareerPopulationCaps(crowded, data.juniorState, {
      f3: 6, f2: 5, reserve: 1, freeAgent: 2, otherMotorsport: 4, retired: 2,
    });
    expect(capped.drivers.filter((driver) => driver.status === "f3")).toHaveLength(6);
    expect(capped.drivers.filter((driver) => driver.status === "f2")).toHaveLength(5);
    expect(capped.drivers.filter((driver) => driver.status === "other-motorsport").length).toBeLessThanOrEqual(4);
    expect(capped.drivers.some((driver) => driver.id === active.id && driver.status === "f1")).toBe(true);
    expect(capped.juniorState.f3DriverIds).toHaveLength(6);
    expect(capped.juniorState.f2DriverIds).toHaveLength(5);
  });

  it("keeps generated talent in a believable range after one junior season", () => {
    const data = fixture();
    const result = advanceJuniorEcosystem({ seed: 301, season: 2031, config, drivers: data.drivers, teams: data.gridTeams, juniorState: data.juniorState });
    const liveJuniors = result.drivers.filter((driver) => driver.status === "f3" || driver.status === "f2");
    const overalls = liveJuniors.map((driver) => calculateCareerOverall(driver, config));
    expect(overalls.every((overall) => overall >= 35 && overall <= 90)).toBe(true);
    expect(overalls.filter((overall) => overall >= 85).length).toBeLessThanOrEqual(2);
  });
});

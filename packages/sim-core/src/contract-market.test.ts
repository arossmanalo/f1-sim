import { describe, expect, it } from "vitest";
import { createUniverse, fastForwardSeason } from "./engine";
import { PRESET_2005 } from "./presets";
import { resolveAutonomousContractMarket } from "./contract-market";

function oneRound() {
  const preset = structuredClone(PRESET_2005);
  preset.weekends = [preset.weekends[0]!];
  return preset;
}

describe("autonomous contract market", () => {
  it("evaluates expiring seats and preserves a legal two-car grid", () => {
    const completed = fastForwardSeason(createUniverse(oneRound(), { mode: "dynasty", seed: 71 }));
    const first = resolveAutonomousContractMarket(completed, 2007).universe;
    const second = resolveAutonomousContractMarket(completed, 2007).universe;
    expect(first.season.teams.every((team) => team.driverIds.length === 2)).toBe(true);
    expect(new Set(first.season.teams.flatMap((team) => team.driverIds)).size).toBe(first.season.teams.length * 2);
    expect(first.season.drivers.filter((driver) => driver.status === "f1").length).toBe(first.season.teams.length * 2);
    expect(first.aiDecisions.some((item) => ["renew", "replace", "accept"].includes(item.kind))).toBe(true);
    expect(first.managementEvents.some((item) => item.type === "contract")).toBe(true);
    const projection = (value: typeof first) => ({ teams: value.season.teams.map((team) => [team.id, team.driverIds]), contracts: value.season.contracts.map((contract) => [contract.driverId, contract.teamId, contract.startSeason, contract.endSeason, contract.status]), decisions: value.aiDecisions.map((item) => [item.kind, item.actorId, item.targetIds, item.outcome]) });
    expect(projection(first)).toEqual(projection(second));
  });

  it("lets a strong incumbent renew while low-value drivers enter the market", () => {
    const completed = fastForwardSeason(createUniverse(oneRound(), { mode: "dynasty", seed: 88 }));
    const strongest = completed.season.teams[0]!.driverIds[0];
    const result = resolveAutonomousContractMarket(completed, 2007);
    const team = result.universe.season.teams.find((candidate) => candidate.id === completed.season.teams[0]!.id)!;
    expect(team.driverIds).toContain(strongest);
    expect(result.summary.released.length + result.summary.renewed.length + result.summary.signed.length).toBeGreaterThan(0);
  });
});

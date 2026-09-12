import { describe, expect, it } from "vitest";
import { realityRows, mergeAllHistory, rankRows } from "./RecordsView";

describe("records aggregation", () => {
  it("keeps Max Verstappen in the real-world race-win leaderboard", () => {
    const max = realityRows.find((row) => row.holder === "Max Verstappen" && row.category === "wins");
    expect(max?.value).toBe(71);
    expect(rankRows(realityRows.filter((row) => row.category === "wins"))[2]?.holder).toBe("Max Verstappen");
  });

  it("adds simulation tallies to the matching real-world holder in all history", () => {
    const merged = mergeAllHistory([
      { holder: "Max Verstappen", category: "wins", value: 71, source: "reality" as const },
      { holder: "Max Verstappen", category: "wins", value: 8, source: "simulation" as const },
    ]);
    expect(merged).toEqual([{ holder: "Max Verstappen", category: "wins", value: 79, source: "combined" }]);
  });

  it("returns ten ranked holders when a category has at least ten entries", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ holder: `Driver ${index + 1}`, category: "wins" as const, value: 100 - index, source: "reality" as const }));
    const ranked = rankRows(rows);
    expect(ranked).toHaveLength(10);
    expect(ranked.at(-1)?.rank).toBe(10);
  });
});

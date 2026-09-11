import { describe, expect, it } from "vitest";
import { confidenceForSample, derivePercentileRating, percentileRank, shrinkTowardMean, teammateAdjusted } from "./ratings";

describe("historical rating derivation", () => {
  it("normalizes within a cohort with higher values always better", () => {
    expect(percentileRank([1, 2, 3, 4, 5], 5)).toBe(1);
    expect(percentileRank([1, 2, 3, 4, 5], 1)).toBe(0);
  });

  it("shrinks small samples more strongly toward the era mean", () => {
    expect(Math.abs(shrinkTowardMean(95, 2) - 50)).toBeLessThan(Math.abs(shrinkTowardMean(95, 20) - 50));
    expect(confidenceForSample(4)).toBe("low");
    expect(confidenceForSample(8)).toBe("medium");
    expect(confidenceForSample(18)).toBe("high");
  });

  it("supports lower-is-better statistical proxies and documents evidence", () => {
    const cohort = [10, 11, 12, 13].map((value) => ({ value, sampleSize: 18, proxy: "median qualifying rank" }));
    const result = derivePercentileRating(cohort, cohort[0]!, { higherIsBetter: false, fetchedAt: "2026-01-01T00:00:00.000Z" });
    expect(result.rating).toBeGreaterThan(50);
    expect(result.evidence.method).toContain("sample-size shrinkage");
    expect(result.evidence.confidence).toBe("high");
  });

  it("can remove a controlled share of team strength before ranking teammates", () => {
    expect(teammateAdjusted(90, 80)).toBe(62);
  });
});

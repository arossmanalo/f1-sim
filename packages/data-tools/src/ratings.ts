import type { Confidence, RatingEvidence } from "@f1-sim/core";

export interface RatingObservation {
  value: number;
  sampleSize: number;
  proxy: string;
}

export interface DerivedRating {
  rating: number;
  evidence: RatingEvidence;
}

export function percentileRank(values: number[], value: number): number {
  if (values.length <= 1) return 0.5;
  const below = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return (below + Math.max(0, equal - 1) / 2) / (values.length - 1);
}

export function shrinkTowardMean(observed: number, sampleSize: number, priorMean = 50, priorWeight = 6): number {
  const sample = Math.max(0, sampleSize);
  return (observed * sample + priorMean * priorWeight) / (sample + priorWeight);
}

export function confidenceForSample(sampleSize: number): Confidence {
  if (sampleSize >= 15) return "high";
  if (sampleSize >= 6) return "medium";
  return "low";
}

export function derivePercentileRating(
  cohort: RatingObservation[],
  observation: RatingObservation,
  options: { higherIsBetter?: boolean; eraFloor?: number; eraCeiling?: number; fetchedAt?: string } = {},
): DerivedRating {
  const higherIsBetter = options.higherIsBetter ?? true;
  const values = cohort.map((item) => higherIsBetter ? item.value : -item.value);
  const comparable = higherIsBetter ? observation.value : -observation.value;
  const percentile = percentileRank(values, comparable);
  const floor = options.eraFloor ?? 35;
  const ceiling = options.eraCeiling ?? 98;
  const normalized = floor + percentile * (ceiling - floor);
  const shrunk = shrinkTowardMean(normalized, observation.sampleSize, 50, 6);
  return {
    rating: Math.max(0, Math.min(100, Math.round(shrunk))),
    evidence: {
      source: "Jolpica season snapshot",
      method: `Within-era percentile of ${observation.proxy}; sample-size shrinkage toward era mean`,
      confidence: confidenceForSample(observation.sampleSize),
      updatedAt: options.fetchedAt ?? new Date().toISOString(),
    },
  };
}

export function teammateAdjusted(value: number, teammateValue: number, sharedTeamWeight = 0.35): number {
  return value - teammateValue * sharedTeamWeight;
}

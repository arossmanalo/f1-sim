import type { NarrativeRequest } from "@f1-sim/core";

export interface ServiceHealth {
  ok: boolean;
  narration: { available: boolean; provider: "gemini"; model: string };
  currentData: { available: boolean; provider: "jolpica" };
  time: string;
}

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  return body as T;
}

export async function getHealth(): Promise<ServiceHealth> {
  return jsonRequest<ServiceHealth>("/api/health");
}

export async function generateNarrative(request: NarrativeRequest): Promise<{ text: string; provider: "gemini"; model: string; promptVersion: string }> {
  return jsonRequest("/api/narration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function refreshCurrentData(): Promise<{ snapshot: { id: string; provider: "jolpica"; fetchedAt: string; schemaVersion: number; immutable: true }; payload: unknown; note: string }> {
  return jsonRequest("/api/data/refresh/current", { method: "POST" });
}

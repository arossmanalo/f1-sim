import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const app = express();
const port = Number(process.env.PORT ?? 4173);
const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const apiKey = process.env.GEMINI_API_KEY?.trim();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : undefined;

app.use(cors({ origin: ["http://localhost:5173", `http://localhost:${port}`] }));
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "f1-sim-local",
    narration: { available: Boolean(ai), provider: "gemini", model },
    currentData: { available: true, provider: "jolpica" },
    time: new Date().toISOString(),
  });
});

const narrativeSchema = z.object({
  scope: z.enum(["event", "session", "weekend", "paddock", "offseason"]),
  scopeId: z.string().min(1).max(120),
  season: z.number().int().min(1950).max(2300),
  title: z.string().min(1).max(160),
  facts: z.array(z.string().min(1).max(400)).min(1).max(40),
  characters: z.array(z.object({ id: z.string(), name: z.string(), team: z.string().optional() })).max(50),
  tone: z.enum(["live", "recap", "paddock"]),
  previousContext: z.string().max(4000).optional(),
});

app.post("/api/narration", async (request, response) => {
  const parsed = narrativeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Narrative request failed validation.", details: parsed.error.flatten() });
  if (!ai) return response.status(503).json({ error: "AI narration unavailable. Add GEMINI_API_KEY to the local environment and restart the launcher.", retryable: true });

  const data = parsed.data;
  const allowedNames = data.characters.map((character) => `${character.name}${character.team ? ` (${character.team})` : ""}`).join(", ");
  const prompt = [
    "You are the restrained but dramatic editorial voice of a Formula racing season simulator.",
    "Write vivid, specific motorsport prose. Never invent a result, number, person, incident, quote, or motivation.",
    "Treat the FACTS block as the complete source of truth. Use only named people and teams from ALLOWED CHARACTERS.",
    `Tone: ${data.tone}. Scope: ${data.scope}. Season: ${data.season}.`,
    `Title: ${data.title}`,
    `ALLOWED CHARACTERS: ${allowedNames || "None"}`,
    "FACTS:",
    ...data.facts.map((fact) => `- ${fact}`),
    data.previousContext ? `CONTINUITY CONTEXT:\n${data.previousContext}` : "",
    "Return two to four compact paragraphs. Do not add a heading or markdown list.",
  ].filter(Boolean).join("\n");

  try {
    const generated = await ai.models.generateContent({ model, contents: prompt });
    const text = generated.text?.trim();
    if (!text) throw new Error("Gemini returned no text.");
    return response.json({ text, provider: "gemini", model, promptVersion: "narrative-v1" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Gemini error";
    return response.status(502).json({ error: message, retryable: true });
  }
});

const jolpicaBase = "https://api.jolpi.ca/ergast/f1";

async function fetchJolpica(endpoint: string): Promise<unknown> {
  const result = await fetch(`${jolpicaBase}/${endpoint}`, {
    headers: { Accept: "application/json", "User-Agent": "F1-SIM/0.1 personal-local-app" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!result.ok) throw new Error(`Jolpica ${endpoint} returned ${result.status}.`);
  return result.json();
}

app.post("/api/data/refresh/current", async (_request, response) => {
  try {
    const [races, drivers, constructors, results, qualifying, sprints] = await Promise.all([
      fetchJolpica("current.json?limit=100"),
      fetchJolpica("current/drivers.json?limit=100"),
      fetchJolpica("current/constructors.json?limit=100"),
      fetchJolpica("current/results.json?limit=3000"),
      fetchJolpica("current/qualifying.json?limit=3000"),
      fetchJolpica("current/sprint.json?limit=1000"),
    ]);
    const fetchedAt = new Date().toISOString();
    const currentSeason = new Date().getFullYear();
    return response.json({
      snapshot: {
        id: `jolpica-current-${currentSeason}-${fetchedAt}`,
        provider: "jolpica",
        season: currentSeason,
        fetchedAt,
        schemaVersion: 1,
        immutable: true,
        note: "Current-season factual snapshot; existing universes remain pinned to their original source.",
      },
      payload: { races, drivers, constructors, results, qualifying, sprints },
      note: "Stored as a new source snapshot. Existing universes are never mutated.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Current data refresh failed.";
    return response.status(502).json({ error: message, retryable: true });
  }
});

const directory = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(directory, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
    return response.sendFile(path.join(webDist, "index.html"));
  });
}

app.use((request, response) => response.status(404).json({ error: `No route for ${request.method} ${request.path}` }));

app.listen(port, "127.0.0.1", () => {
  console.log(`F1 SIM is running at http://localhost:${port}`);
  console.log(ai ? `Gemini narration ready with ${model}.` : "Gemini narration unavailable; simulation will continue without it.");
});

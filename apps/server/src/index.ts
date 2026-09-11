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
  storyContext: z.object({
    seasonArc: z.array(z.string().min(1).max(400)).max(12),
    rivalries: z.array(z.object({ title: z.string().max(120), drivers: z.array(z.string().max(100)).max(4), summary: z.string().max(400) })).max(8),
    teamDramas: z.array(z.object({ team: z.string().max(100), summary: z.string().max(500) })).max(10),
    driverTrajectories: z.array(z.object({ name: z.string().max(100), age: z.number().int().min(14).max(80), potential: z.number().min(0).max(100), rating: z.number().min(0).max(100), points: z.number().min(0), trend: z.string().max(160) })).max(20),
    teamTrajectories: z.array(z.object({ team: z.string().max(100), points: z.number().min(0), trend: z.string().max(160), upgrades: z.number().int().min(0) })).max(20),
    upgrades: z.array(z.object({ team: z.string().max(100), round: z.number().int().min(1).max(100), summary: z.string().max(400) })).max(12),
  }).optional(),
});

app.post("/api/narration", async (request, response) => {
  const parsed = narrativeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Narrative request failed validation.", details: parsed.error.flatten() });
  if (!ai) return response.status(503).json({ error: "AI narration unavailable. Add GEMINI_API_KEY to the local environment and restart the launcher.", retryable: true });

  const data = parsed.data;
  const allowedNames = data.characters.map((character) => `${character.name}${character.team ? ` (${character.team})` : ""}`).join(", ");
  const allowedTeams = [...new Set(data.characters.map((character) => character.team).filter(Boolean))].join(", ");
  const prompt = [
    "You are the continuing season storyteller for a restrained but dramatic Formula racing simulator.",
    "Write a season story, not a box-score recap: connect the latest moments to rivalries, teammate tension, team politics, development swings, rookie emergence, aging, and title pressure.",
    "Never invent a result, number, person, incident, quote, private motivation, or relationship. If the context does not support a claim, leave it out.",
    "Treat FACTS and SEASON STORY CONTEXT as the complete source of truth. Use only named people from ALLOWED CHARACTERS and teams from ALLOWED TEAMS.",
    `Tone: ${data.tone}. Scope: ${data.scope}. Season: ${data.season}.`,
    `Title: ${data.title}`,
    `ALLOWED CHARACTERS: ${allowedNames || "None"}`,
    `ALLOWED TEAMS: ${allowedTeams || "None"}`,
    "FACTS:",
    ...data.facts.map((fact) => `- ${fact}`),
    data.storyContext ? `SEASON STORY CONTEXT (structured, canonical):\n${JSON.stringify(data.storyContext, null, 2)}` : "",
    data.previousContext ? `CONTINUITY CONTEXT:\n${data.previousContext}` : "",
    "Return three to five compact paragraphs with a clear sense of what this season is becoming. Do not add a heading or markdown list.",
  ].filter(Boolean).join("\n");

  try {
    const generated = await ai.models.generateContent({ model, contents: prompt });
    const text = generated.text?.trim();
    if (!text) throw new Error("Gemini returned no text.");
    return response.json({ text, provider: "gemini", model, promptVersion: "narrative-v2" });
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

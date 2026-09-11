import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchSeasonSnapshot } from "./jolpica";

const season = Number(process.argv[2]);
const outputRoot = path.resolve(process.argv[3] ?? "data/snapshots");

if (!Number.isInteger(season)) {
  throw new Error("Usage: pnpm data:fetch <season> [output-directory]");
}

const snapshot = await fetchSeasonSnapshot(season);
await mkdir(outputRoot, { recursive: true });
const outputPath = path.join(outputRoot, `${snapshot.id}.json`);
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
process.stdout.write(`${outputPath}\n`);

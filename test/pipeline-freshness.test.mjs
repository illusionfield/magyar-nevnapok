import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const execFileAsync = promisify(execFile);

function createLocalConfig() {
  return {
    version: 1,
    generatedAt: "2026-04-21T09:00:00.000Z",
    source: "helyi felhasználói beállítások",
    ics: {
      partitionMode: "single",
      shared: {
        input: "output/adatbazis/nevnapok.yaml",
        leapProfile: "off",
        fromYear: 2026,
        untilYear: 2040,
        baseYear: 2024,
      },
      single: {
        output: "output/naptar/nevnapok.ics",
        layout: "grouped",
        descriptionMode: "none",
        descriptionFormat: "text",
        ordinalDay: "none",
        includeOtherDays: false,
        calendarName: "Névnapok",
      },
      split: {
        primary: {
          output: "output/naptar/nevnapok-primary.ics",
          layout: "grouped",
          descriptionMode: "none",
          descriptionFormat: "text",
          ordinalDay: "none",
          includeOtherDays: false,
          calendarName: "Névnapok — elsődleges",
        },
        rest: {
          output: "output/naptar/nevnapok-rest.ics",
          layout: "grouped",
          descriptionMode: "none",
          descriptionFormat: "text",
          ordinalDay: "none",
          includeOtherDays: false,
          calendarName: "Névnapok — további",
        },
      },
    },
    personalPrimary: {
      primarySource: "default",
      modifiers: {
        normalized: false,
        ranking: false,
      },
      days: [],
    },
  };
}

async function copyPath(relativeSource, targetPath) {
  const sourcePath = path.join(repoRoot, relativeSource);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true, preserveTimestamps: true });
}

async function prepareWorkspace(rootDir) {
  await copyPath("data/nevnapok_tisztitott_regi_nevkeszlet.ics", path.join(rootDir, "data", "nevnapok_tisztitott_regi_nevkeszlet.ics"));
  await copyPath("data/primary-registry-overrides.yaml", path.join(rootDir, "data", "primary-registry-overrides.yaml"));
  await copyPath("output/adatbazis/nevnapok.yaml", path.join(rootDir, "output", "adatbazis", "nevnapok.yaml"));
  await copyPath("output/primer", path.join(rootDir, "output", "primer"));
  await copyPath("output/riportok", path.join(rootDir, "output", "riportok"));
  const manifestPath = path.join(rootDir, "output", "pipeline", "manifest.yaml");
  await copyPath("output/pipeline/manifest.yaml", manifestPath);
  await fs.mkdir(path.join(rootDir, ".local"), { recursive: true });
  const localConfigPath = path.join(rootDir, ".local", "nevnapok.local.yaml");
  await fs.writeFile(localConfigPath, `${JSON.stringify(createLocalConfig(), null, 2)}\n`, "utf8");
  const manifestText = await fs.readFile(manifestPath, "utf8");
  const generatedAtMatch = manifestText.match(
    /stepId:\s+audit-primer-audit[\s\S]*?generatedAt:\s+([0-9TZ:.-]+)/u
  );
  const referenceTime = generatedAtMatch ? Date.parse(generatedAtMatch[1]) : Date.now();
  const future = new Date(referenceTime + 60_000);
  await fs.utimes(localConfigPath, future, future);
}

test("a pipeline frissesség a manifest-időket használja, ezért a másolt workspace nem jelzi tévesen elavultnak a nehéz lépéseket", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-pipeline-freshness-"));
  await prepareWorkspace(workspace);
  const runnerUrl = pathToFileURL(path.join(repoRoot, "pipeline", "futtato.mjs")).href;
  const script = `
    const { listazPipelineAllapot } = await import(${JSON.stringify(runnerUrl)});
    const state = await listazPipelineAllapot();
    process.stdout.write(JSON.stringify(state));
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: workspace,
  });
  const allapot = JSON.parse(stdout);
  const byId = new Map(allapot.map((entry) => [entry.azonosito, entry]));

  assert.equal(byId.get("portal-nevadatbazis-epites")?.status, "kesz");
  assert.equal(byId.get("audit-primer-audit")?.status, "elavult");
});

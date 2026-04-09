import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const gyoker = process.cwd();
const binUtvonal = path.join(gyoker, "bin", "nevnapok.mjs");

test("a CLI súgó elérhető", async () => {
  const { stdout } = await execFileAsync(process.execPath, [binUtvonal, "--help"], {
    cwd: gyoker,
  });

  assert.match(stdout, /pipeline/i);
  assert.match(stdout, /kimenet/i);
  assert.match(stdout, /audit/i);
  assert.match(stdout, /tui/i);
});

test("a kimenet súgó tartalmazza a csv és excel formátumokat", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [binUtvonal, "kimenet", "general", "--help"],
    {
      cwd: gyoker,
    }
  );

  assert.match(stdout, /csv/i);
  assert.match(stdout, /excel/i);
});

test("az ICS súgó már nem listázza kiemelt opcióként a primerforrást, csak kompatibilitási megjegyzésként", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [binUtvonal, "kimenet", "general", "ics", "--help"],
    {
      cwd: gyoker,
    }
  );

  assert.doesNotMatch(stdout, /Primerforrás: default, legacy, ranked vagy either/);
  assert.match(stdout, /--primary-source kapcsoló kompatibilitási okból/);
  assert.match(stdout, /Saját primer szerkesztő/);
});

test("az audit súgó tartalmazza a primer nélkül maradó nevek auditot", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [binUtvonal, "audit", "futtat", "--help"],
    {
      cwd: gyoker,
    }
  );

  assert.match(stdout, /primer-nelkul-marado-nevek/);
});

test("a TUI súgó tartalmazza a primer szerkesztő kezdőnézetét", async () => {
  const { stdout } = await execFileAsync(process.execPath, [binUtvonal, "tui", "--help"], {
    cwd: gyoker,
  });

  assert.match(stdout, /primer-szerkeszto/);
  assert.match(stdout, /audit-vegso-primer-inspector/);
  assert.match(stdout, /audit-primer-nelkul-inspector/);
});

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

test("az ICS súgó a helyi YAML-profilt emeli ki, és nem listázza a részletes ICS-kapcsolókat", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [binUtvonal, "kimenet", "general", "ics", "--help"],
    {
      cwd: gyoker,
    }
  );

  assert.match(stdout, /\.local\/nevnapok\.local\.yaml/u);
  assert.match(stdout, /mentett profiljából dolgozik/u);
  assert.doesNotMatch(stdout, /--scope <mod>/);
  assert.doesNotMatch(stdout, /--layout <mod>/);
  assert.doesNotMatch(stdout, /--rest-handling <mod>/);
  assert.doesNotMatch(stdout, /--rest-layout <mod>/);
  assert.doesNotMatch(stdout, /--leap-profile <profil>/);
  assert.doesNotMatch(stdout, /--from-year <ev>/);
  assert.doesNotMatch(stdout, /--description-format <formatum>/);
  assert.doesNotMatch(stdout, /--mode <mod>/);
  assert.doesNotMatch(stdout, /--split-primary-rest/);
  assert.doesNotMatch(stdout, /--primary-calendar-mode/);
  assert.doesNotMatch(stdout, /--rest-calendar-mode/);
  assert.doesNotMatch(stdout, /--primary-source/);
  assert.doesNotMatch(stdout, /--leap-mode/);
  assert.doesNotMatch(stdout, /--leap-strategy/);
  assert.match(stdout, /személyes primerprofil/u);
  assert.match(stdout, /aktív ICS kimenet mód/u);
});

test("a legacy ICS kapcsoló célzott hibával áll le", async () => {
  try {
    await execFileAsync(
      process.execPath,
      [binUtvonal, "kimenet", "general", "ics", "--mode", "together"],
      {
        cwd: gyoker,
      }
    );
    assert.fail("A legacy kapcsolónak hibára kellett volna futnia.");
  } catch (error) {
    assert.match(
      `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      /--mode kapcsoló megszűnt.*\.local\/nevnapok\.local\.yaml/us
    );
  }
});

test("az új részletes ICS kapcsoló is célzott hibával áll le", async () => {
  try {
    await execFileAsync(
      process.execPath,
      [binUtvonal, "kimenet", "general", "ics", "--scope", "primary"],
      {
        cwd: gyoker,
      }
    );
    assert.fail("A részletes ICS kapcsolónak hibára kellett volna futnia.");
  } catch (error) {
    assert.match(
      `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      /--scope kapcsoló megszűnt.*\.local\/nevnapok\.local\.yaml/us
    );
  }
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

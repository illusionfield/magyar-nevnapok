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

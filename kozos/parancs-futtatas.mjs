/**
 * kozos/parancs-futtatas.mjs
 * Belső folyamatok futtatása az elsődleges CLI mögül.
 */

import { spawn } from "node:child_process";

/**
 * A `futtatNodeFolyamat` külön Node-folyamatban futtat egy belső worker modult.
 */
export function futtatNodeFolyamat(modulUtvonal, argumentumok = [], opciok = {}) {
  return new Promise((resolve, reject) => {
    const folyamat = spawn(process.execPath, [modulUtvonal, ...argumentumok], {
      cwd: opciok.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...(opciok.env ?? {}),
      },
      stdio: opciok.orokolStdout ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (!opciok.orokolStdout) {
      folyamat.stdout?.on("data", (darab) => {
        const szoveg = String(darab);
        stdout += szoveg;
        if (opciok.tukrozzStdout) {
          process.stdout.write(szoveg);
        }
      });

      folyamat.stderr?.on("data", (darab) => {
        const szoveg = String(darab);
        stderr += szoveg;
        if (opciok.tukrozzStderr !== false) {
          process.stderr.write(szoveg);
        }
      });
    }

    folyamat.on("error", reject);
    folyamat.on("close", (kod) => {
      if (kod === 0) {
        resolve({ stdout, stderr, kod });
        return;
      }

      const hiba = new Error(`A belső folyamat hibával állt le: ${modulUtvonal} (exit=${kod})`);
      hiba.kod = kod;
      hiba.stdout = stdout;
      hiba.stderr = stderr;
      reject(hiba);
    });
  });
}

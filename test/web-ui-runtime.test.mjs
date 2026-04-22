import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

import { epitPuppeteerInditasiBeallitasokat } from "../kozos/puppeteer-inditas.mjs";

const repoRoot = process.cwd();
const devScript = path.join(repoRoot, "web", "server", "dev.mjs");

async function startDevServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [devScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      const match = text.match(/http:\/\/127\.0\.0\.1:(\d+)/u);

      if (match && !resolved) {
        resolved = true;
        resolve({
          child,
          baseUrl: `http://127.0.0.1:${match[1]}`,
        });
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("exit", (code) => {
      if (resolved) {
        return;
      }

      reject(new Error(`A fejlesztői webszerver túl korán leállt (exit=${code}).\n${stdout}\n${stderr}`));
    });
    child.on("error", reject);
  });
}

async function stopServer(child) {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    child.once("exit", () => resolve());
  });
}

async function installWsProbe(page) {
  await page.evaluateOnNewDocument(() => {
    window.__wsDebug = {
      sendCount: 0,
      messageCount: 0,
      lastSendAt: 0,
      requestTypes: {},
      incomingTypes: {},
    };

    const NativeWebSocket = window.WebSocket;

    class DebugWebSocket extends NativeWebSocket {
      constructor(...args) {
        super(...args);

        this.addEventListener("message", (event) => {
          window.__wsDebug.messageCount += 1;

          try {
            const payload = JSON.parse(String(event.data));

            if (payload.tipus) {
              window.__wsDebug.incomingTypes[payload.tipus] =
                (window.__wsDebug.incomingTypes[payload.tipus] ?? 0) + 1;
            }
          } catch {
            // noop
          }
        });
      }

      send(data) {
        try {
          const payload = JSON.parse(String(data));

          if (payload.tipus) {
            window.__wsDebug.sendCount += 1;
            window.__wsDebug.lastSendAt = Date.now();
            window.__wsDebug.requestTypes[payload.tipus] =
              (window.__wsDebug.requestTypes[payload.tipus] ?? 0) + 1;
          }
        } catch {
          // noop
        }

        return super.send(data);
      }
    }

    for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
      Object.defineProperty(DebugWebSocket, key, {
        value: NativeWebSocket[key],
      });
    }

    globalThis.WebSocket = DebugWebSocket;
    window.WebSocket = DebugWebSocket;
  });
}

function createConsoleCollectors(page) {
  const consoleMessages = [];
  const pageErrors = [];

  page.on("console", (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return {
    consoleMessages,
    pageErrors,
  };
}

async function waitForWsQuiet(page, timeoutMs = 25_000) {
  await page.waitForFunction(
    () => window.__wsDebug.sendCount > 0,
    { timeout: timeoutMs }
  );
  await page.waitForFunction(
    () => Date.now() - (window.__wsDebug.lastSendAt ?? 0) > 1_000,
    { timeout: timeoutMs }
  );
}

async function readWsDebug(page) {
  return page.evaluate(() => ({
    sendCount: window.__wsDebug.sendCount,
    messageCount: window.__wsDebug.messageCount,
    requestTypes: { ...window.__wsDebug.requestTypes },
    incomingTypes: { ...window.__wsDebug.incomingTypes },
  }));
}

async function expectQuietWindow(page, label) {
  await waitForWsQuiet(page);
  const before = await readWsDebug(page);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const after = await readWsDebug(page);
  assert.equal(after.sendCount, before.sendCount, `${label}: a route betöltése után nem csendesedett le a WS forgalom.`);
  return after;
}

function assertNoRenderLoopErrors(label, consoleMessages, pageErrors) {
  const combined = [
    ...consoleMessages.map((entry) => `${entry.type}: ${entry.text}`),
    ...pageErrors.map((entry) => `pageerror: ${entry}`),
  ];
  const offender = combined.find(
    (entry) =>
      entry.includes("Maximum update depth exceeded") ||
      entry.includes("Too many re-renders")
  );

  assert.equal(offender, undefined, `${label}: render-loop hiba került a kliens konzolba: ${offender}`);
}

test("a web GUI route-jai nem indulnak végtelen WS kérésciklusba, és a havi nézetek tényleg lustán töltenek", async (t) => {
  const { child, baseUrl } = await startDevServer();

  t.after(async () => {
    await stopServer(child);
  });

  const browser = await puppeteer.launch(epitPuppeteerInditasiBeallitasokat());
  t.after(async () => {
    await browser.close();
  });

  const dashboardPage = await browser.newPage();
  const dashboardLogs = createConsoleCollectors(dashboardPage);
  await installWsProbe(dashboardPage);
  await dashboardPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  const dashboardStats = await expectQuietWindow(dashboardPage, "dashboard");
  assert.equal(dashboardStats.requestTypes["dashboard:get"], 1, "A dashboardnak pontosan egy summary lekérést kell indítania.");
  assertNoRenderLoopErrors("dashboard", dashboardLogs.consoleMessages, dashboardLogs.pageErrors);
  await dashboardPage.close();

  const auditPage = await browser.newPage();
  const auditLogs = createConsoleCollectors(auditPage);
  await installWsProbe(auditPage);
  await auditPage.goto(`${baseUrl}/auditok`, { waitUntil: "domcontentloaded" });
  let auditStats = await expectQuietWindow(auditPage, "auditok kezdőnézet");
  assert.equal(auditStats.requestTypes["audits:get-catalog"], 1, "Az auditkatalógusnak egyszer kell betöltődnie.");
  assert.equal(auditStats.requestTypes["audits:get-detail-summary"], 1, "A kiválasztott audit summaryja egyszer töltődjön be.");
  assert.equal(auditStats.requestTypes["audits:get-detail-month"] ?? 0, 0, "Csukott hónapokhoz nem szabad havi auditlekérést indítani.");

  await auditPage.evaluate(() => {
    const target = document.querySelector("[data-audit-id=\"wiki-vs-legacy\"]");

    if (!target) {
      throw new Error("A wiki-vs-legacy auditkártya nem található.");
    }

    target.click();
  });
  auditStats = await expectQuietWindow(auditPage, "auditváltás wiki nézetre");
  assert.equal(auditStats.requestTypes["audits:get-detail-summary"], 2, "Auditváltáskor pontosan egy új summary kérés várható.");
  assert.equal(auditStats.requestTypes["audits:get-detail-month"] ?? 0, 0, "A wiki audit csukott hónapjai továbbra se töltsenek részleteket.");

  await auditPage.evaluate(() => {
    const summary = document.querySelector(".audit-detail-column .month-accordion summary");

    if (!summary) {
      throw new Error("Nem található havi accordion a wiki audit részleteinél.");
    }

    summary.click();
  });
  await auditPage.waitForFunction(
    () => (window.__wsDebug.requestTypes["audits:get-detail-month"] ?? 0) >= 1,
    { timeout: 10_000 }
  );
  auditStats = await expectQuietWindow(auditPage, "audit havi megnyitás");
  assert.equal(auditStats.requestTypes["audits:get-detail-month"], 1, "Egy havi auditpanel megnyitása pontosan egy havi részletlekérést indítson.");
  assertNoRenderLoopErrors("auditok", auditLogs.consoleMessages, auditLogs.pageErrors);
  await auditPage.close();

  const primerPage = await browser.newPage();
  const primerLogs = createConsoleCollectors(primerPage);
  await installWsProbe(primerPage);
  await primerPage.goto(`${baseUrl}/primer-audit`, { waitUntil: "domcontentloaded" });
  let primerStats = await expectQuietWindow(primerPage, "primer audit kezdőnézet");
  assert.equal(primerStats.requestTypes["primer-audit:get-summary"], 1, "A primer audit summarynak egyszer kell betöltődnie.");
  assert.equal(primerStats.requestTypes["primer-audit:get-names"] ?? 0, 0, "Napnézetben nem szabad névnézeti lekérést indítani.");
  assert.equal(primerStats.requestTypes["primer-audit:get-month"] ?? 0, 0, "Csukott primer hónapokhoz nem szabad havi lekérést indítani.");

  await primerPage.evaluate(() => {
    const summary = document.querySelector(".month-accordion summary");

    if (!summary) {
      throw new Error("Nem található havi accordion a primer audit napnézetben.");
    }

    summary.click();
  });
  await primerPage.waitForFunction(
    () => (window.__wsDebug.requestTypes["primer-audit:get-month"] ?? 0) >= 1,
    { timeout: 10_000 }
  );
  primerStats = await expectQuietWindow(primerPage, "primer audit havi megnyitás");
  assert.equal(primerStats.requestTypes["primer-audit:get-month"], 1, "Egy primer havi panel megnyitása pontosan egy havi részletlekérést indítson.");

  await primerPage.evaluate(() => {
    const namesTab = [...document.querySelectorAll(".tab-button")].find((element) => element.textContent.includes("Nevek"));

    if (!namesTab) {
      throw new Error("A Nevek tab nem található.");
    }

    namesTab.click();
  });
  await primerPage.waitForFunction(
    () => (window.__wsDebug.requestTypes["primer-audit:get-names"] ?? 0) >= 1,
    { timeout: 10_000 }
  );
  primerStats = await expectQuietWindow(primerPage, "primer audit névnézet");
  assert.equal(primerStats.requestTypes["primer-audit:get-names"], 1, "A névnézet első betöltése egyetlen névlistás lekérést indítson.");
  assertNoRenderLoopErrors("primer audit", primerLogs.consoleMessages, primerLogs.pageErrors);
  await primerPage.close();

  const icsPage = await browser.newPage();
  const icsLogs = createConsoleCollectors(icsPage);
  await installWsProbe(icsPage);
  await icsPage.goto(`${baseUrl}/ics`, { waitUntil: "domcontentloaded" });
  const icsStats = await expectQuietWindow(icsPage, "ics");
  assert.equal(icsStats.requestTypes["ics:get-editor"], 1, "Az ICS oldalnak egyetlen editor summary lekérést kell indítania.");
  assert.equal(icsStats.requestTypes["ics:preview"] ?? 0, 1, "Az ICS oldalnak egyetlen automatikus előnézetet kell kérnie a mentett állapothoz.");
  assert.equal(icsStats.requestTypes["ics:get-raw-preview"] ?? 0, 0, "A nyers ICS előnézet maradjon lustán betöltött.");
  assertNoRenderLoopErrors("ics", icsLogs.consoleMessages, icsLogs.pageErrors);
  await icsPage.close();
});

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
  const shellState = await dashboardPage.evaluate(() => ({
    hasSidebarCopy: document.body.innerText.includes("Gyors admin nézet"),
    topbarNavLabels: [...document.querySelectorAll(".topbar-nav .nav-link")].map((element) => element.textContent.trim()),
    hasTopbarViewMode: Boolean(document.querySelector(".topbar-view-mode")),
  }));
  assert.equal(shellState.hasSidebarCopy, false, "A régi bal oldali Gyors admin nézet szöveg ne jelenjen meg.");
  assert.deepEqual(shellState.topbarNavLabels, ["Irányítópult", "Pipeline", "Auditok", "Primer audit", "ICS"]);
  assert.equal(shellState.hasTopbarViewMode, true, "A nézetmód kapcsoló a top-barban legyen.");
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

  await auditPage.waitForSelector("[data-audit-id=\"wiki-vs-legacy\"]", { timeout: 10_000 });
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
  await primerPage.setViewport({ width: 1440, height: 1000 });
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
  const assertPrimerTableNoHorizontalOverflow = async (label) => {
    const overflowState = await primerPage.evaluate(() => {
      const wrap = document.querySelector(".primer-audit-table-wrap");

      if (!wrap) {
        throw new Error("Nem található primer audit table-wrap.");
      }

      return {
        clientWidth: wrap.clientWidth,
        scrollWidth: wrap.scrollWidth,
      };
    });

    assert.ok(
      overflowState.scrollWidth <= overflowState.clientWidth + 1,
      `${label}: a primer audit table-wrap ne váljon vízszintesen görgethetővé (client=${overflowState.clientWidth}, scroll=${overflowState.scrollWidth}).`
    );
  };
  await assertPrimerTableNoHorizontalOverflow("primer audit havi megnyitás");
  const primerTableState = await primerPage.evaluate(() => {
    const sourceLabel = document.querySelector(".primer-audit-table .audit-name-chip-source");
    const firstChip = document.querySelector(".primer-audit-table .audit-name-chip");
    const firstPencil = document.querySelector(".primer-audit-table .icon-action-button");

    return {
      dayFilterLabels: [...document.querySelectorAll(".filter-button-row .tab-button")].map((button) => button.textContent.trim()),
      headers: [...document.querySelectorAll(".primer-audit-table thead th")].map((element) => element.textContent.trim()),
      hasMiniMeta: Boolean(document.querySelector(".primer-audit-table .mini-meta")),
      hasPencilButton: [...document.querySelectorAll(".primer-audit-table .icon-action-button")].some((button) => button.textContent.includes("✎")),
      statusDotTooltips: [...document.querySelectorAll(".primer-audit-table .audit-status-dot")].map((element) => element.getAttribute("data-tooltip")),
      normalizedDiffTooltips: [...document.querySelectorAll(".primer-audit-table .audit-status-dot.normalized")]
        .map((element) => element.getAttribute("data-tooltip")),
      firstChipTooltip: firstChip?.getAttribute("data-tooltip") ?? null,
      pencilTooltip: firstPencil?.getAttribute("data-tooltip") ?? null,
      domTitleCount: document.querySelectorAll("[title]").length,
      compactSourceDisplay: sourceLabel ? getComputedStyle(sourceLabel).display : null,
      firstNameWhiteSpace: getComputedStyle(document.querySelector(".primer-audit-table .audit-name-chip-label")).whiteSpace,
      firstNameTextOverflow: getComputedStyle(document.querySelector(".primer-audit-table .audit-name-chip-label")).textOverflow,
    };
  });
  assert.equal(
    primerTableState.dayFilterLabels.includes("Nincs OK, nincs eltérés"),
    true,
    "A primer audit napnézetben legyen tiszta, nem leokézott szűrő."
  );
  assert.deepEqual(primerTableState.headers, ["Dátum", "Végső primer", "Egyéb nevek", "Audit"]);
  assert.equal(primerTableState.hasMiniMeta, false, "A napi sor dátum mini-meta nélkül jelenjen meg.");
  assert.equal(primerTableState.hasPencilButton, true, "A napi editor nyitása pencil gombbal történjen.");
  assert.equal(primerTableState.statusDotTooltips.includes("Nincs leokézva"), true);
  assert.equal(
    primerTableState.normalizedDiffTooltips.some((tooltip) => tooltip?.includes("Eltérés van a Normalizált primerhez képest.")),
    true,
    "A napi audit státuszpontok jelezzék a Normalizált primerhez képesti eltérést."
  );
  assert.ok(primerTableState.firstChipTooltip, "A névchip CSS tooltip adatot kapjon.");
  assert.equal(primerTableState.pencilTooltip, "Napi primer audit szerkesztése", "A pencil gomb CSS tooltipet kapjon.");
  assert.equal(primerTableState.domTitleCount, 0, "A primer audit DOM-ban ne legyen natív title attribútum.");
  assert.equal(primerTableState.compactSourceDisplay, "none", "Kompakt módban a chip forráslabel ne legyen inline látható.");
  assert.equal(primerTableState.firstNameWhiteSpace, "nowrap");
  assert.notEqual(primerTableState.firstNameTextOverflow, "ellipsis");

  await primerPage.evaluate(() => {
    const bulkButton = [...document.querySelectorAll(".section-block .toolbar > button")]
      .find((element) => element.textContent.includes("Tömeges műveletek"));

    if (!bulkButton) {
      throw new Error("Nem található Tömeges műveletek gomb.");
    }

    bulkButton.click();
  });
  await primerPage.waitForFunction(
    () => (window.__wsDebug.requestTypes["primer-audit:get-day-selection-scope"] ?? 0) >= 1,
    { timeout: 10_000 }
  );
  await primerPage.waitForSelector(".month-bulk-select input", { timeout: 10_000 });
  await primerPage.waitForFunction(
    () => {
      const input = document.querySelector(".month-bulk-select input");
      const counter = document.querySelector(".month-bulk-select")?.textContent ?? "";
      const total = Number(counter.match(/\/\s*(\d+)/u)?.[1] ?? 0);

      return input && !input.disabled && total > 0;
    },
    { timeout: 10_000 }
  );
  const bulkInitialState = await primerPage.evaluate(() => ({
    hasMonthCheckbox: Boolean(document.querySelector(".month-bulk-select input")),
    hasDayCheckbox: Boolean(document.querySelector(".primer-audit-table .day-bulk-select input")),
    monthCounter: document.querySelector(".month-bulk-select")?.textContent.trim() ?? "",
    selectedText: document.querySelector(".bulk-action-toolbar .muted-text")?.textContent.trim() ?? "",
    actionButtons: [...document.querySelectorAll(".bulk-action-toolbar button")]
      .map((button) => ({
        label: button.textContent.trim(),
        disabled: button.disabled,
      })),
  }));
  assert.equal(bulkInitialState.hasMonthCheckbox, true, "Bulk módban legyen hónapszintű checkbox.");
  assert.equal(bulkInitialState.hasDayCheckbox, true, "Bulk módban legyen sorszintű checkbox.");
  assert.match(bulkInitialState.monthCounter, /0\s*\/\s*\d+ kijelölve/u);
  assert.match(bulkInitialState.selectedText, /Kijelölt napok: 0/u);
  assert.equal(
    bulkInitialState.actionButtons.find((button) => button.label === "Jóváhagyás")?.disabled,
    true,
    "A bulk jóváhagyás kijelölés nélkül legyen tiltott."
  );
  assert.equal(
    bulkInitialState.actionButtons.find((button) => button.label === "Reset")?.disabled,
    true,
    "A bulk reset kijelölés nélkül legyen tiltott."
  );

  await primerPage.evaluate(() => {
    document.querySelector(".month-bulk-select input")?.click();
  });
  await primerPage.waitForFunction(
    () => /Kijelölt napok: [1-9]/u.test(document.querySelector(".bulk-action-toolbar .muted-text")?.textContent ?? ""),
    { timeout: 10_000 }
  );
  const bulkSelectedState = await primerPage.evaluate(() => ({
    monthCounter: document.querySelector(".month-bulk-select")?.textContent.trim() ?? "",
    selectedText: document.querySelector(".bulk-action-toolbar .muted-text")?.textContent.trim() ?? "",
    actionButtons: [...document.querySelectorAll(".bulk-action-toolbar button")]
      .map((button) => ({
        label: button.textContent.trim(),
        disabled: button.disabled,
      })),
  }));
  assert.match(bulkSelectedState.monthCounter, /\d+\s*\/\s*\d+ kijelölve/u);
  assert.match(bulkSelectedState.selectedText, /Kijelölt napok: [1-9]/u);
  assert.equal(
    bulkSelectedState.actionButtons.find((button) => button.label === "Jóváhagyás")?.disabled,
    false,
    "A bulk jóváhagyás kijelölés után legyen aktív."
  );
  assert.equal(
    bulkSelectedState.actionButtons.find((button) => button.label === "Reset")?.disabled,
    false,
    "A bulk reset kijelölés után legyen aktív."
  );

  await primerPage.evaluate(() => {
    const detailedButton = [...document.querySelectorAll(".topbar-view-mode .tab-button")]
      .find((element) => element.textContent.includes("Részletes"));

    if (!detailedButton) {
      throw new Error("A részletes nézet gomb nem található.");
    }

    detailedButton.click();
  });
  const detailedSourceDisplay = await primerPage.evaluate(() => {
    const sourceLabel = document.querySelector(".primer-audit-table .audit-name-chip-source");
    return sourceLabel ? getComputedStyle(sourceLabel).display : null;
  });
  assert.notEqual(detailedSourceDisplay, "none", "Részletes módban a chip forráslabel a név alatt látszódjon.");

  await primerPage.evaluate(() => {
    const rowWithMissing = [...document.querySelectorAll(".primer-audit-table tbody tr")]
      .find((row) =>
        [...row.querySelectorAll(".audit-status-dot")]
          .some((dot) => dot.getAttribute("data-tooltip")?.includes("Primer nélkül maradó"))
      );
    const pencil = rowWithMissing?.querySelector(".icon-action-button");

    if (!pencil) {
      throw new Error("Nem található primer nélkül maradó napi pencil gomb.");
    }

    pencil.click();
  });
  await primerPage.waitForFunction(
    () => (window.__wsDebug.requestTypes["primer-audit:get-day-name-details"] ?? 0) >= 1,
    { timeout: 10_000 }
  );
  primerStats = await expectQuietWindow(primerPage, "primer audit napi editor");
  assert.equal(primerStats.requestTypes["primer-audit:get-day-name-details"], 1, "A napi editor nyitása egy előtöltött névdetail kérést indítson.");
  await assertPrimerTableNoHorizontalOverflow("primer audit editor nyitás");
  await primerPage.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await assertPrimerTableNoHorizontalOverflow("primer audit window resize");
  const editorState = await primerPage.evaluate(() => ({
    hasLeftInspector: Boolean(document.querySelector(".day-audit-inspector")),
    hasInfoWindowBeforeClick: Boolean(document.querySelector(".name-detail-window")),
    hasEvidenceLinks: Boolean(document.querySelector(".day-audit-editor .evidence-link-list")),
    hasConcreteFacts: Boolean(document.querySelector(".day-audit-editor .audit-evidence-facts")),
    toolbarButtons: [...document.querySelectorAll(".day-audit-editor .toolbar button")]
      .map((button) => ({
        label: button.textContent.trim(),
        disabled: button.disabled,
      })),
    helperText: document.querySelector(".day-audit-editor .toolbar .muted-text")?.textContent.trim() ?? "",
    allDayNamesParentClass: document.querySelector(".day-audit-editor .all-day-names-panel")?.parentElement?.className ?? "",
    allDayNamesGridColumnStart: document.querySelector(".day-audit-editor .all-day-names-panel")
      ? getComputedStyle(document.querySelector(".day-audit-editor .all-day-names-panel")).gridColumnStart
      : null,
    allDayNamesGridColumnEnd: document.querySelector(".day-audit-editor .all-day-names-panel")
      ? getComputedStyle(document.querySelector(".day-audit-editor .all-day-names-panel")).gridColumnEnd
      : null,
    missingChipClass: document.querySelector(".day-audit-editor .audit-name-chip-missing-badge")
      ?.closest(".audit-name-chip")?.className ?? "",
    missingChipTooltip: document.querySelector(".day-audit-editor .audit-name-chip-missing-badge")
      ?.closest(".audit-name-chip")?.getAttribute("data-tooltip") ?? "",
    missingBadgeText: document.querySelector(".day-audit-editor .audit-name-chip-missing-badge")?.textContent.trim() ?? "",
  }));
  assert.equal(editorState.hasLeftInspector, false, "A régi bal oldali day-audit-inspector ne maradjon bent.");
  assert.equal(editorState.hasInfoWindowBeforeClick, false, "Az inline névinfo ablak csak kiválasztott névnél jelenjen meg.");
  assert.equal(editorState.hasEvidenceLinks, false, "A Végső auditált primer boxban ne linklista legyen.");
  assert.equal(editorState.hasConcreteFacts, true, "A Végső auditált primer box konkrét auditadatokat mutasson.");
  assert.deepEqual(
    editorState.toolbarButtons.map((button) => button.label),
    ["Audit mentése", "Bezárás"],
    "A napi editor OK/Cancel helyett magyar, audit-specifikus gombokat használjon."
  );
  assert.equal(
    editorState.toolbarButtons.find((button) => button.label === "Audit mentése")?.disabled,
    false,
    "Az Audit mentése gomb tiszta draftnál is legyen elérhető."
  );
  assert.equal(editorState.toolbarButtons.some((button) => ["OK", "Cancel"].includes(button.label)), false);
  assert.match(editorState.helperText, /audit időbélyeg frissül/u);
  assert.match(editorState.allDayNamesParentClass, /audit-source-grid/u, "A teljes napi névlista panel az audit-source-grid része legyen.");
  assert.equal(editorState.allDayNamesGridColumnStart, "1");
  assert.equal(editorState.allDayNamesGridColumnEnd, "-1");
  assert.match(editorState.missingChipClass, /tone-danger/u, "A primer nélkül maradó névchip kapjon danger kiemelést.");
  assert.match(editorState.missingChipTooltip, /Primer nélkül maradó/u, "A primer nélkül maradó névchip tooltipje jelezze a hiányt.");
  assert.equal(editorState.missingBadgeText, "∅", "A primer nélkül maradó névchip kapjon ∅ jelvényt.");

  const firstInfoButtonLabel = await primerPage.evaluate(() => {
    const missingChip = document.querySelector(".day-audit-editor .audit-name-chip-missing-badge")?.closest(".audit-name-chip");
    const infoButton = missingChip?.querySelector(".audit-name-chip-actions button[aria-label*='audit információ']");

    if (!infoButton) {
      throw new Error("Nem található primer nélkül maradó névinfo i gomb.");
    }

    infoButton.click();
    return infoButton.getAttribute("aria-label");
  });
  await primerPage.waitForSelector(".name-detail-window .name-detail-main-grid", { timeout: 10_000 });
  const infoWindowState = await primerPage.evaluate(() => {
    const windowElement = document.querySelector(".name-detail-window");
    const body = document.querySelector(".name-detail-window .name-detail-body");

    return {
      hasWindow: Boolean(windowElement),
      hasTabs: Boolean(document.querySelector(".name-detail-window .name-detail-tabs")),
      hasClose: Boolean(document.querySelector(".name-detail-window .name-detail-head .name-detail-close")),
      hasRawToggle: Boolean(document.querySelector(".name-detail-window .name-detail-raw-toggle")),
      rawToggleExpanded: document.querySelector(".name-detail-window .name-detail-raw-toggle")?.getAttribute("aria-expanded") ?? null,
      hasMaximize: Boolean(document.querySelector(".name-detail-window .name-detail-maximize")),
      hasResizeHandle: Boolean(document.querySelector(".name-detail-window .name-detail-resize-handle")),
      hasRawGrid: Boolean(document.querySelector(".name-detail-window .name-detail-raw-grid")),
      mainColumnCount: getComputedStyle(document.querySelector(".name-detail-window .name-detail-main-grid")).gridTemplateColumns.split(" ").length,
      windowPosition: windowElement ? getComputedStyle(windowElement).position : null,
      windowBottom: windowElement ? getComputedStyle(windowElement).bottom : null,
      windowOverflow: windowElement ? getComputedStyle(windowElement).overflow : null,
      bodyOverflow: body ? getComputedStyle(body).overflow : null,
      occurrenceCardCount: document.querySelectorAll(".name-detail-window .occurrence-audit-card").length,
      occurrenceBadgeCount: document.querySelectorAll(".name-detail-window .occurrence-badge").length,
      hasOccurrenceSourceSummary: Boolean(document.querySelector(".name-detail-window .occurrence-source-summary")),
      hasOccurrenceFinalPrimer: [...document.querySelectorAll(".name-detail-window .occurrence-audit-facts span")]
        .some((element) => element.textContent.includes("Végső primer")),
      hasOccurrenceMissingNote: Boolean(document.querySelector(".name-detail-window .occurrence-missing-note")),
      domTitleCount: document.querySelectorAll("[title]").length,
    };
  });
  assert.equal(infoWindowState.hasWindow, true, "Az i gombra fixed névinfo ablak jelenjen meg.");
  assert.equal(infoWindowState.hasTabs, false, "A régi 4 tabos névinfo UI ne maradjon bent.");
  assert.equal(infoWindowState.hasClose, true, "A name-detail-head jobb oldalán legyen close gomb.");
  assert.equal(infoWindowState.hasRawToggle, true, "A headben legyen nyersadat expandable toggle.");
  assert.equal(infoWindowState.rawToggleExpanded, "false", "A nyersadat expandable default zárt legyen.");
  assert.equal(infoWindowState.hasMaximize, true, "A headben legyen maximize/minimize gomb.");
  assert.equal(infoWindowState.hasResizeHandle, true, "A fixed alsó ablak tetején legyen resize handle.");
  assert.equal(infoWindowState.hasRawGrid, false, "A nyersadat grid zárt állapotban ne látszódjon.");
  assert.ok(infoWindowState.mainColumnCount >= 3, "Desktopon a fő névinfo három oszlopban jelenjen meg.");
  assert.equal(infoWindowState.windowPosition, "fixed", "A névinfo ablak fixed legyen.");
  assert.notEqual(infoWindowState.windowBottom, "auto", "A fixed névinfo ablak alul legyen rögzítve.");
  assert.equal(infoWindowState.windowOverflow, "visible", "A névinfo ablak maga ne kapjon belső overflow-t.");
  assert.match(infoWindowState.bodyOverflow, /auto/u, "Csak a head alatti névinfo body scrollozzon.");
  assert.equal(infoWindowState.occurrenceCardCount > 0, true, "A névdetail előfordulások kompakt auditkártyák legyenek.");
  assert.equal(infoWindowState.occurrenceBadgeCount > 0, true, "Az occurrence auditkártyák státusz/forrás jelvényeket mutassanak.");
  assert.equal(infoWindowState.hasOccurrenceSourceSummary, true, "Az occurrence auditkártya forrás-primer összképet mutasson.");
  assert.equal(infoWindowState.hasOccurrenceFinalPrimer, true, "Az occurrence auditkártya mutassa a végső primerlistát.");
  assert.equal(infoWindowState.hasOccurrenceMissingNote, true, "Primer nélkül maradó névnél jelenjen meg hiányblokk az occurrence kártyán.");
  assert.equal(infoWindowState.domTitleCount, 0, "Az inline névinfo után se legyen natív title attribútum.");

  await primerPage.evaluate(() => {
    const handle = document.querySelector(".name-detail-window .name-detail-resize-handle");

    if (!handle) {
      throw new Error("Nem található name-detail resize handle.");
    }

    handle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      clientY: window.innerHeight - 260,
      pointerId: 1,
    }));
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientY: window.innerHeight - 360,
      pointerId: 1,
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      clientY: window.innerHeight - 360,
      pointerId: 1,
    }));
  });
  await primerPage.waitForFunction(
    () => document.querySelector(".name-detail-window")?.getBoundingClientRect().height >= 340,
    { timeout: 10_000 }
  );

  await primerPage.evaluate(() => {
    document.querySelector(".name-detail-window .name-detail-raw-toggle")?.click();
  });
  await primerPage.waitForSelector(".name-detail-window .name-detail-raw-grid", { timeout: 10_000 });
  const rawState = await primerPage.evaluate(() => ({
    rawToggleExpanded: document.querySelector(".name-detail-window .name-detail-raw-toggle")?.getAttribute("aria-expanded") ?? null,
    rawColumnCount: getComputedStyle(document.querySelector(".name-detail-window .name-detail-raw-grid")).gridTemplateColumns.split(" ").length,
    jsonBlockCount: document.querySelectorAll(".name-detail-window .name-detail-raw-grid .name-detail-json").length,
    preOverflow: document.querySelector(".name-detail-window .name-detail-json pre")
      ? getComputedStyle(document.querySelector(".name-detail-window .name-detail-json pre")).overflow
      : null,
    preWhiteSpace: document.querySelector(".name-detail-window .name-detail-json pre")
      ? getComputedStyle(document.querySelector(".name-detail-window .name-detail-json pre")).whiteSpace
      : null,
  }));
  assert.equal(rawState.rawToggleExpanded, "true", "Nyitás után a nyersadat expandable aria-expanded értéke true legyen.");
  assert.equal(rawState.jsonBlockCount, 2, "A nyersadat expandable két blokkot mutasson.");
  assert.ok(rawState.rawColumnCount >= 2, "Desktopon a nyersadat expandable két oszlopban jelenjen meg.");
  assert.equal(rawState.preOverflow, "visible", "A raw pre ne kapjon belső scrollt.");
  assert.equal(rawState.preWhiteSpace, "pre-wrap", "A raw pre törhető legyen.");

  await primerPage.evaluate(() => {
    document.querySelector(".name-detail-window .name-detail-maximize")?.click();
  });
  await primerPage.waitForFunction(
    () => document.querySelector(".name-detail-window")?.classList.contains("maximized"),
    { timeout: 10_000 }
  );
  const maximizedState = await primerPage.evaluate(() => {
    const windowElement = document.querySelector(".name-detail-window");
    const rect = windowElement.getBoundingClientRect();

    return {
      isMaximized: windowElement.classList.contains("maximized"),
      top: Math.round(rect.top),
      bottomSpace: Math.round(window.innerHeight - rect.bottom),
      isPressed: document.querySelector(".name-detail-window .name-detail-maximize")?.getAttribute("aria-pressed") ?? null,
    };
  });
  assert.equal(maximizedState.isMaximized, true, "Maximize után az ablak maximized állapotba kerüljön.");
  assert.ok(maximizedState.top <= 20, "Maximize után az ablak szinte teljes képernyős legyen.");
  assert.ok(maximizedState.bottomSpace <= 20, "Maximize után az ablak szinte teljes képernyős legyen alul is.");
  assert.equal(maximizedState.isPressed, "true", "Maximize állapotban az aria-pressed true legyen.");

  await primerPage.evaluate(() => {
    document.querySelector(".name-detail-window .name-detail-maximize")?.click();
  });
  await primerPage.waitForFunction(
    () => document.querySelector(".name-detail-window") && !document.querySelector(".name-detail-window").classList.contains("maximized"),
    { timeout: 10_000 }
  );
  const minimizedState = await primerPage.evaluate(() => ({
    isDocked: document.querySelector(".name-detail-window")?.classList.contains("docked") ?? false,
    height: Math.round(document.querySelector(".name-detail-window")?.getBoundingClientRect().height ?? 0),
    isPressed: document.querySelector(".name-detail-window .name-detail-maximize")?.getAttribute("aria-pressed") ?? null,
  }));
  assert.equal(minimizedState.isDocked, true, "Minimize után az ablak visszatérjen bottom dock módba.");
  assert.ok(minimizedState.height >= 340, "Minimize után a kézzel állított magasság maradjon meg.");
  assert.equal(minimizedState.isPressed, "false", "Dockolt állapotban az aria-pressed false legyen.");

  await primerPage.evaluate((label) => {
    const infoButton = [...document.querySelectorAll(".day-audit-editor .audit-name-chip-actions button")]
      .find((button) => button.getAttribute("aria-label") === label);

    if (!infoButton) {
      throw new Error("Nem található a korábbi névinfo i gomb.");
    }

    infoButton.click();
  }, firstInfoButtonLabel);
  await primerPage.waitForFunction(
    () => !document.querySelector(".name-detail-window"),
    { timeout: 10_000 }
  );

  await primerPage.evaluate((label) => {
    const infoButton = [...document.querySelectorAll(".day-audit-editor .audit-name-chip-actions button")]
      .find((button) => button.getAttribute("aria-label") === label);

    if (!infoButton) {
      throw new Error("Nem található a névinfo i gomb az újranyitáshoz.");
    }

    infoButton.click();
  }, firstInfoButtonLabel);
  await primerPage.waitForSelector(".name-detail-window .name-detail-body", { timeout: 10_000 });
  await primerPage.evaluate(() => {
    document.querySelector(".name-detail-window .name-detail-close")?.click();
  });
  await primerPage.waitForFunction(
    () => !document.querySelector(".name-detail-window"),
    { timeout: 10_000 }
  );

  await primerPage.evaluate(() => {
    const activePencil = document.querySelector(".primer-audit-table .icon-action-button.active");

    if (!activePencil) {
      throw new Error("Nem található aktív napi pencil gomb.");
    }

    activePencil.click();
  });
  await primerPage.waitForFunction(
    () => !document.querySelector(".day-audit-editor"),
    { timeout: 10_000 }
  );
  await assertPrimerTableNoHorizontalOverflow("primer audit editor zárás");
  const assertPrimerNameTableNoHorizontalOverflow = async (label) => {
    const overflowState = await primerPage.evaluate(() => {
      const wrap = document.querySelector(".primer-audit-name-table-wrap");

      if (!wrap) {
        throw new Error("Nem található primer audit name table-wrap.");
      }

      return {
        clientWidth: wrap.clientWidth,
        scrollWidth: wrap.scrollWidth,
        bodyClientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.documentElement.scrollWidth,
      };
    });

    assert.ok(
      overflowState.scrollWidth <= overflowState.clientWidth + 1,
      `${label}: a primer audit name table-wrap ne váljon vízszintesen görgethetővé (client=${overflowState.clientWidth}, scroll=${overflowState.scrollWidth}).`
    );
    assert.ok(
      overflowState.bodyScrollWidth <= overflowState.bodyClientWidth + 1,
      `${label}: a primer audit névnézet ne okozzon body horizontal overflow-t (client=${overflowState.bodyClientWidth}, scroll=${overflowState.bodyScrollWidth}).`
    );
  };

  await primerPage.evaluate(() => {
    const namesTab = [...document.querySelectorAll(".tab-button")].find((element) => element.textContent.includes("Nevek"));

    if (!namesTab) {
      throw new Error("A Nevek tab nem található.");
    }

    namesTab.click();
  });
  await primerPage.waitForFunction(
    () => (window.__wsDebug.requestTypes["primer-audit:get-name-index"] ?? 0) >= 1,
    { timeout: 10_000 }
  );
  primerStats = await expectQuietWindow(primerPage, "primer audit névnézet");
  assert.equal(primerStats.requestTypes["primer-audit:get-name-index"], 1, "A névnézet első betöltése egyetlen ABC index lekérést indítson.");
  assert.equal(primerStats.requestTypes["primer-audit:get-name-letter"] ?? 0, 0, "Csukott kezdőbetű accordionhoz nem szabad névrészletet kérni.");
  const nameIndexState = await primerPage.evaluate(() => ({
    hasSelect: Boolean(document.querySelector(".section-block select")),
    hasPager: document.body.innerText.includes("Előző oldal") || document.body.innerText.includes("Következő oldal"),
    filterButtonCount: document.querySelectorAll(".filter-button-row .tab-button").length,
    groupCount: document.querySelectorAll(".name-letter-accordion").length,
  }));
  assert.equal(nameIndexState.hasSelect, false, "A Nevek tabon ne legyen select alapú filter vagy sort.");
  assert.equal(nameIndexState.hasPager, false, "A Nevek tabon ne maradjon lapozó.");
  assert.equal(nameIndexState.filterButtonCount > 0, true, "A Nevek tab filtergombokat használjon.");
  assert.equal(nameIndexState.groupCount > 0, true, "A Nevek tab ABC accordion csoportokat mutasson.");

  await primerPage.evaluate(() => {
    const summary = document.querySelector(".name-letter-accordion summary");

    if (!summary) {
      throw new Error("Nem található kezdőbetű accordion.");
    }

    summary.click();
  });
  await primerPage.waitForFunction(
    () => (window.__wsDebug.requestTypes["primer-audit:get-name-letter"] ?? 0) >= 1,
    { timeout: 10_000 }
  );
  primerStats = await expectQuietWindow(primerPage, "primer audit név kezdőbetű");
  assert.equal(primerStats.requestTypes["primer-audit:get-name-letter"], 1, "Egy kezdőbetű megnyitása pontosan egy betűrészlet-lekérést indítson.");
  const nameTableState = await primerPage.evaluate(() => {
    const firstStatusDot = document.querySelector(".primer-audit-name-table .audit-status-dot");
    const firstInfoButton = document.querySelector(".primer-audit-name-table .icon-action-button");

    return {
      headers: [...document.querySelectorAll(".primer-audit-name-table thead th")].map((element) => element.textContent.trim()),
      statusTooltip: firstStatusDot?.getAttribute("data-tooltip") ?? null,
      infoTooltip: firstInfoButton?.getAttribute("data-tooltip") ?? null,
      rowKpis: Boolean(document.querySelector(".primer-audit-name-table .catalog-kpis")),
      hasDateColumn: Boolean(document.querySelector(".primer-audit-name-table td:nth-child(2) .small-name-list")),
      collapsedDateSuffix: document.querySelector(".primer-audit-name-table td:nth-child(2) .small-name-list")?.textContent.includes("… +") ?? false,
      domTitleCount: document.querySelectorAll("[title]").length,
    };
  });
  assert.deepEqual(nameTableState.headers, ["Név", "Napok", "Audit KPI-k", "Audit"]);
  assert.ok(nameTableState.statusTooltip, "A név státuszkör CSS tooltipet kapjon.");
  assert.equal(nameTableState.infoTooltip, "Név audit információ", "A névinfo gomb CSS tooltipet kapjon.");
  assert.equal(nameTableState.rowKpis, true, "A névsorban catalog-kpis jelenjen meg.");
  assert.equal(nameTableState.hasDateColumn, true, "A névsorban a dátumlista külön Napok oszlopba kerüljön.");
  assert.equal(nameTableState.collapsedDateSuffix, false, "A névsor dátumlistája ne használjon … +N rövidítést.");
  assert.equal(nameTableState.domTitleCount, 0, "A Nevek tab DOM-ban se legyen natív title attribútum.");
  await assertPrimerNameTableNoHorizontalOverflow("primer audit név kezdőbetű");

  await primerPage.evaluate(() => {
    document.querySelector(".primer-audit-name-table .icon-action-button")?.click();
  });
  await primerPage.waitForFunction(
    () => (window.__wsDebug.requestTypes["primer-audit:get-name-detail"] ?? 0) >= 1,
    { timeout: 10_000 }
  );
  primerStats = await expectQuietWindow(primerPage, "primer audit névinfo");
  assert.equal(primerStats.requestTypes["primer-audit:get-name-detail"], 1, "Az első névinfo nyitás egy lazy névdetail kérést indítson.");
  await primerPage.waitForSelector(".name-inline-detail-panel .name-detail-main-grid", { timeout: 10_000 });
  const inlineDetailState = await primerPage.evaluate(() => ({
    hasInlinePanel: Boolean(document.querySelector(".name-inline-detail-panel")),
    hasFixedWindow: Boolean(document.querySelector(".name-detail-window")),
    hasRawToggle: Boolean(document.querySelector(".name-inline-detail-panel .name-detail-raw-toggle")),
    rawBlockCount: document.querySelectorAll(".name-inline-detail-panel .name-inline-raw-stack .name-detail-json").length,
    hasAuditSummary: Boolean(document.querySelector(".name-inline-detail-panel .name-inline-audit-summary")),
    hasInlineHead: Boolean(document.querySelector(".name-inline-detail-panel .name-inline-detail-head")),
    rawStackOverflowX: getComputedStyle(document.querySelector(".name-inline-detail-panel .name-inline-raw-stack")).overflowX,
    occurrenceCardCount: document.querySelectorAll(".name-inline-detail-panel .occurrence-audit-card").length,
    occurrenceBadgeCount: document.querySelectorAll(".name-inline-detail-panel .occurrence-badge").length,
    hasOccurrenceSourceSummary: Boolean(document.querySelector(".name-inline-detail-panel .occurrence-source-summary")),
    domTitleCount: document.querySelectorAll("[title]").length,
  }));
  assert.equal(inlineDetailState.hasInlinePanel, true, "A névinfo sor alatti inline panelként jelenjen meg.");
  assert.equal(inlineDetailState.hasFixedWindow, false, "A Nevek tab névinfo ne nyissa meg a fixed bottom ablakot.");
  assert.equal(inlineDetailState.hasRawToggle, false, "A Nevek tab inline detailben ne legyen raw dropdown.");
  assert.equal(inlineDetailState.rawBlockCount, 2, "A raw oszlopban két raw blokk jelenjen meg.");
  assert.equal(inlineDetailState.hasAuditSummary, true, "A bal oldali audit summary jelenjen meg.");
  assert.equal(inlineDetailState.hasInlineHead, false, "A Nevek tab inline detailben ne maradjon külön fejléc.");
  assert.match(inlineDetailState.rawStackOverflowX, /auto/u, "A raw oszlop saját inline vízszintes scrollt kapjon.");
  assert.equal(inlineDetailState.occurrenceCardCount > 0, true, "A Nevek tab inline detail is occurrence auditkártyákat használjon.");
  assert.equal(inlineDetailState.occurrenceBadgeCount > 0, true, "A Nevek tab occurrence kártyái jelvényeket mutassanak.");
  assert.equal(inlineDetailState.hasOccurrenceSourceSummary, true, "A Nevek tab occurrence kártyái forrás-primer összképet mutassanak.");
  assert.equal(inlineDetailState.domTitleCount, 0, "A névinfo inline panel után se legyen natív title attribútum.");
  await assertPrimerNameTableNoHorizontalOverflow("primer audit névinfo nyitás");

  await primerPage.evaluate(() => {
    document.querySelector(".primer-audit-name-table .icon-action-button.active")?.click();
  });
  await primerPage.waitForFunction(
    () => !document.querySelector(".name-inline-detail-panel"),
    { timeout: 10_000 }
  );

  await primerPage.evaluate(() => {
    document.querySelector(".primer-audit-name-table .icon-action-button")?.click();
  });
  await primerPage.waitForSelector(".name-inline-detail-panel", { timeout: 10_000 });
  await primerPage.evaluate(() => {
    document.querySelector(".name-inline-detail-panel .name-detail-close")?.click();
  });
  await primerPage.waitForFunction(
    () => !document.querySelector(".name-inline-detail-panel"),
    { timeout: 10_000 }
  );
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

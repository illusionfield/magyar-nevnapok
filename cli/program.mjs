/**
 * cli/program.mjs
 * Az elsődleges CLI definíciója.
 */

import { Command, Help, Option } from "commander";
import picocolors from "picocolors";
import {
  allitSajatPrimerForrast,
  allitSajatPrimerModositot,
  betoltPrimerAuditAdata,
  futtatAuditot,
  futtatPipeline,
  generalKimenetet,
  hozzaadHelyiPrimerKiegeszitest,
  listazAuditokat,
  listazKimenetiFormatumokat,
  listazPipelineCelLista,
  pipelineAllapot,
  torolHelyiPrimerKiegeszitest,
  torolGoogleNaptarat,
} from "../index.mjs";
import { printDataTable, printKeyValueTable } from "../kozos/terminal-tabla.mjs";
import { futtatTui } from "../tui/index.mjs";

/**
 * Az `osszefoglalPipelineAllapot` számszerű összegzést készít a pipeline-lépések állapotáról.
 */
function osszefoglalPipelineAllapot(sorok) {
  const darabok = sorok.reduce((akk, sor) => {
    akk[sor.status] = (akk[sor.status] ?? 0) + 1;
    return akk;
  }, {});

  return [
    ["Összes lépés", sorok.length],
    ["Kész", darabok.kesz ?? 0],
    ["Hiányzik", darabok.hianyzik ?? 0],
    ["Elavult", darabok.elavult ?? 0],
    ["Blokkolt", darabok.blokkolt ?? 0],
    ["Függőségre vár", darabok["fuggoseg-frissitesre-var"] ?? 0],
  ];
}

/**
 * A `formataltStatusz` színezett, emberileg olvasható állapotszöveget ad vissza.
 */
function formataltStatusz(status) {
  if (status === "kesz") {
    return picocolors.green(status);
  }

  if (status === "elavult") {
    return picocolors.yellow(status);
  }

  if (status === "hianyzik" || status === "blokkolt") {
    return picocolors.red(status);
  }

  return picocolors.cyan(status);
}

function formataltLista(values = [], maxItems = 8) {
  const lista = (Array.isArray(values) ? values : []).filter(Boolean);

  if (lista.length === 0) {
    return "—";
  }

  const lathato = lista.slice(0, maxItems).join(", ");
  const maradek = lista.length > maxItems ? ` … (+${lista.length - maxItems})` : "";
  return `${lathato}${maradek}`;
}

function primerAuditKiemeltNapSorok(adat) {
  return (adat?.months ?? [])
    .flatMap((month) => month.rows ?? [])
    .filter(
      (row) =>
        (row.effectiveMissing ?? row.combinedMissing ?? []).length > 0 ||
        (row.localSelectedCount ?? 0) > 0 ||
        row.warning === true ||
        (row.hidden ?? []).length > 0
    )
    .slice(0, 12)
    .map((row) => ({
      nap: row.monthDay,
      primerek: formataltLista(
        row.effectivePreferredNames ?? row.finalPrimaryNames ?? row.preferredNames ?? [],
        4
      ),
      forras: row.source ?? "—",
      hianyzo: (row.effectiveMissing ?? row.combinedMissing ?? []).length,
      helyi: row.localSelectedCount ?? 0,
    }));
}

function keresPrimerAuditSort(adat, monthDay) {
  return (adat?.months ?? [])
    .flatMap((month) => (month.rows ?? []).map((row) => ({ ...row, monthName: month.monthName })))
    .find((row) => row.monthDay === monthDay);
}

function nyomtatPrimerAuditReszleteket(row, resz) {
  const szakasz = row?.sections?.[resz];

  if (!row || !szakasz) {
    throw new Error(`Nem található primer audit részlet ehhez a kéréshez: ${resz}`);
  }

  if (resz === "osszefoglalo") {
    printKeyValueTable(
      `Primer audit – ${row.monthDay} – összkép`,
      [
        ["Hónap", row.monthName ?? "—"],
        ["Közös alap", formataltLista(szakasz.commonPreferredNames ?? szakasz.preferredNames ?? [])],
        ["Helyi overlay", formataltLista(szakasz.localAddedPreferredNames ?? [])],
        ["Eredő helyi", formataltLista(szakasz.effectivePreferredNames ?? [])],
        ["Forrás", szakasz.source ?? "—"],
        ["Figyelmeztetés", szakasz.warning ? "igen" : "nem"],
        ["Rejtett név", szakasz.hiddenCount ?? 0],
        ["Közös hiányzó", szakasz.combinedMissingCount ?? 0],
        ["Helyben feloldott", szakasz.locallyResolvedMissingCount ?? 0],
        ["Helyben nyitott", szakasz.effectiveMissingCount ?? 0],
        ["Nyers aznapi név", szakasz.rawNameCount ?? 0],
      ],
      {
        keyWidth: 20,
        valueWidth: 80,
      }
    );
    return;
  }

  if (resz === "forrasok") {
    printKeyValueTable(
      `Primer audit – ${row.monthDay} – források`,
      [
        ["Közös alap", formataltLista(szakasz.commonPreferredNames ?? szakasz.preferredNames ?? [])],
        ["Helyi overlay", formataltLista(szakasz.localAddedPreferredNames ?? [])],
        ["Eredő helyi", formataltLista(szakasz.effectivePreferredNames ?? [])],
        ["Legacy", formataltLista(szakasz.legacy ?? [])],
        ["Wiki", formataltLista(szakasz.wiki ?? [])],
        ["Normalizált", formataltLista(szakasz.normalized ?? [])],
        ["Rangsorolt", formataltLista(szakasz.ranking ?? [])],
        ["Rejtett", formataltLista(szakasz.hidden ?? [])],
        ["Nyers névsor", formataltLista(szakasz.rawNames ?? [], 12)],
        ["Forrás", szakasz.source ?? "—"],
        ["Figyelmeztetés", szakasz.warning ? "igen" : "nem"],
      ],
      {
        keyWidth: 18,
        valueWidth: 90,
      }
    );
    return;
  }

  if (resz === "hianyzok") {
    printDataTable(
      `Primer audit – ${row.monthDay} – helyben nyitott hiányzók`,
      [
        { key: "nev", title: "Név", width: 22 },
        { key: "forras", title: "Forrás", width: 18 },
        { key: "kiemelt", title: "Kiemelt", width: 10 },
        { key: "hasonlo", title: "Hasonló primerek", width: 42 },
      ],
      (szakasz.effectiveMissing ?? szakasz.combinedMissing ?? []).map((entry) => ({
        nev: entry.name,
        forras: formataltLista(entry.sources ?? [], 3),
        kiemelt: entry.highlight ? "igen" : "nem",
        hasonlo: formataltLista(
          (entry.similarPrimaries ?? []).map(
            (item) => `${item.primaryName}${item.relation ? ` (${item.relation})` : ""}`
          ),
          4
        ),
      }))
    );

    printDataTable(
      `Primer audit – ${row.monthDay} – helyben feloldott hiányzók`,
      [
        { key: "nev", title: "Név", width: 22 },
        { key: "forras", title: "Forrás", width: 18 },
        { key: "kiemelt", title: "Kiemelt", width: 10 },
        { key: "hasonlo", title: "Hasonló primerek", width: 42 },
      ],
      (szakasz.locallyResolvedMissing ?? []).map((entry) => ({
        nev: entry.name,
        forras: formataltLista(entry.sources ?? [], 3),
        kiemelt: entry.highlight ? "igen" : "nem",
        hasonlo: formataltLista(
          (entry.similarPrimaries ?? []).map(
            (item) => `${item.primaryName}${item.relation ? ` (${item.relation})` : ""}`
          ),
          4
        ),
      }))
    );

    printDataTable(
      `Primer audit – ${row.monthDay} – közös hiányzók`,
      [
        { key: "nev", title: "Név", width: 22 },
        { key: "forras", title: "Forrás", width: 18 },
        { key: "kiemelt", title: "Kiemelt", width: 10 },
        { key: "hasonlo", title: "Hasonló primerek", width: 42 },
      ],
      (szakasz.combinedMissing ?? []).map((entry) => ({
        nev: entry.name,
        forras: formataltLista(entry.sources ?? [], 3),
        kiemelt: entry.highlight ? "igen" : "nem",
        hasonlo: formataltLista(
          (entry.similarPrimaries ?? []).map(
            (item) => `${item.primaryName}${item.relation ? ` (${item.relation})` : ""}`
          ),
          4
        ),
      }))
    );

    return;
  }

  printKeyValueTable(
    `Primer audit – ${row.monthDay} – helyi overlay`,
    [
      ["Közös alap", formataltLista(row.commonPreferredNames ?? row.finalPrimaryNames ?? [])],
      ["Helyi overlay", formataltLista(szakasz.localAddedPreferredNames ?? row.localAddedPreferredNames ?? [])],
      ["Eredő helyi", formataltLista(row.effectivePreferredNames ?? [])],
      ["Kézzel kért", formataltLista(szakasz.selectedNames ?? [])],
      ["Fel nem oldott kézi", formataltLista(szakasz.unresolvedLocalNames ?? row.unresolvedLocalNames ?? [])],
    ],
    {
      keyWidth: 18,
      valueWidth: 72,
    }
  );

  printDataTable(
    `Primer audit – ${row.monthDay} – helyi jelölések`,
    [
      { key: "nev", title: "Név", width: 22 },
      { key: "helyi", title: "Helyi", width: 10 },
      { key: "valaszthato", title: "Választható", width: 12 },
      { key: "forras", title: "Forrás", width: 18 },
      { key: "manualOnly", title: "Kézi-only", width: 12 },
    ],
    (szakasz.entries ?? []).map((entry) => ({
      nev: entry.name,
      helyi: entry.localSelected ? "igen" : "nem",
      valaszthato: entry.localSelectable === false ? "nem" : "igen",
      forras: formataltLista(entry.sources ?? [], 3),
      manualOnly: entry.manualOnly ? "igen" : "nem",
    }))
  );

  printKeyValueTable(
    `Primer audit – ${row.monthDay} – helyi beállítások`,
    [
      [
        "Primerforrás",
        szakasz.settingsSnapshot?.primarySource ?? "default",
      ],
      [
        "Normalizált",
        szakasz.settingsSnapshot?.modifiers?.normalized ? "be" : "ki",
      ],
      ["Rangsor", szakasz.settingsSnapshot?.modifiers?.ranking ? "be" : "ki"],
      ["Kézi kérések", formataltLista(szakasz.selectedNames ?? [])],
    ],
    {
      keyWidth: 18,
      valueWidth: 50,
    }
  );

  return;
}

class MagyarHelp extends Help {
  formatHelp(parancs, seged) {
    return super
      .formatHelp(parancs, seged)
      .replace(/^Usage:/m, "Használat:")
      .replace(/^Options:/m, "Opciók:")
      .replace(/^Arguments:/m, "Argumentumok:")
      .replace(/^Commands:/m, "Parancsok:");
  }
}

Command.prototype.createHelp = function createHelpMagyarul() {
  return new MagyarHelp();
};

/**
 * A `letrehozCliProgram` összeállítja a teljes parancssori felületet.
 */
export function letrehozCliProgram() {
  const program = new Command();

  program
    .name("nevnapok")
    .description("Magyar névnap pipeline, audit és kimenetkezelő CLI.")
    .helpOption("-h, --help", "Súgó megjelenítése")
    .addHelpCommand("sugo [parancs]", "Parancs súgójának megjelenítése")
    .showHelpAfterError()
    .showSuggestionAfterError()
    .addHelpText(
      "after",
      `
Példák:
  nevnapok pipeline allapot
  nevnapok pipeline futtat teljes
  nevnapok kimenet general ics
  nevnapok audit futtat hivatalos-nevjegyzek
  nevnapok audit primer
  nevnapok audit primer reszletek --nap 04-18 --resz forrasok
  nevnapok tui
  nevnapok tui --nezet primer-audit
`
    );

  const pipelineParancs = program
    .command("pipeline")
    .description("Az elsődleges pipeline állapotának megtekintése és futtatása.");

  pipelineParancs
    .command("allapot")
    .description("Megmutatja, melyik lépés kész, hiányzik vagy elavult.")
    .action(async () => {
      const sorok = await pipelineAllapot();

      printKeyValueTable("Pipeline összegzés", osszefoglalPipelineAllapot(sorok), {
        keyWidth: 22,
        valueWidth: 16,
      });

      printDataTable(
        "Pipeline lépések",
        [
          { key: "azonosito", title: "Azonosító", width: 28 },
          { key: "status", title: "Státusz", width: 22 },
          { key: "utolsoFutas", title: "Utolsó futás", width: 28 },
          { key: "utolsoStatus", title: "Manifest státusz", width: 18 },
        ],
        sorok.map((sor) => ({
          azonosito: sor.azonosito,
          status: formataltStatusz(sor.status),
          utolsoFutas: sor.utolsoFutas ?? "—",
          utolsoStatus: sor.utolsoStatus ?? "—",
        })),
        {
          rowStyle: null,
        }
      );
    });

  pipelineParancs
    .command("futtat <cel>")
    .description("Lefuttat egy pipeline-célt vagy a teljes építési láncot.")
    .option("--format <formatum>", "Opcionális exportformátum a strukturált artifactok mellé", "yaml")
    .option("--force", "A már kész lépéseket is újrafuttatja.", false)
    .addHelpText(
      "after",
      `
Elérhető célok:
  ${listazPipelineCelLista().join(", ")}
`
    )
    .action(async (cel, opciok) => {
      await futtatPipeline(cel, { formatum: opciok.format, force: opciok.force });
    });

  const kimenetParancs = program
    .command("kimenet")
    .description("Kimeneti artifactok és exportok generálása.");

  kimenetParancs
    .command("general <formatum>")
    .description("Lefuttatja a kiválasztott kimeneti generátort.")
    .option(
      "--input <utvonal>",
      "Bemeneti útvonal. ICS, CSV és Excel esetén a névadatbázis artifactra mutat."
    )
    .option(
      "--output <utvonal>",
      "Kimeneti útvonal. ICS esetén célfájl, CSV esetén cél-CSV, Excel esetén cél-XLSX."
    )
    .addOption(new Option("--primary-output <utvonal>").hideHelp())
    .addOption(new Option("--rest-output <utvonal>").hideHelp())
    .addOption(new Option("--scope <mod>").hideHelp())
    .addOption(new Option("--layout <mod>").hideHelp())
    .addOption(new Option("--rest-handling <mod>").hideHelp())
    .addOption(new Option("--rest-layout <mod>").hideHelp())
    .addOption(new Option("--leap-profile <profil>").hideHelp())
    .addOption(new Option("--from-year <ev>").argParser(Number).hideHelp())
    .addOption(new Option("--until-year <ev>").argParser(Number).hideHelp())
    .addOption(new Option("--base-year <ev>").argParser(Number).hideHelp())
    .addOption(new Option("--description <mod>").hideHelp())
    .addOption(new Option("--description-format <formatum>").hideHelp())
    .addOption(new Option("--ordinal-day <mod>").hideHelp())
    .addOption(new Option("--include-other-days").hideHelp())
    .addOption(new Option("--calendar-name <nev>").hideHelp())
    .addOption(new Option("--local-primary-overrides [utvonal]").hideHelp())
    .addOption(new Option("--mode <mod>").hideHelp())
    .addOption(new Option("--split-primary-rest").hideHelp())
    .addOption(new Option("--primary-calendar-mode <mod>").hideHelp())
    .addOption(new Option("--rest-calendar-mode <mod>").hideHelp())
    .addOption(new Option("--primary-source <forras>").hideHelp())
    .addOption(new Option("--leap-mode <mod>").hideHelp())
    .addOption(new Option("--leap-strategy <strategia>").hideHelp())
    .addOption(new Option("--no-other-days").hideHelp())
    .addHelpText(
      "after",
      `
Elérhető formátumok:
  ${listazKimenetiFormatumokat().join(", ")}

Megjegyzés:
  Az ICS generálás a nem követett .local/nevnapok.local.yaml fájl mentett profiljából dolgozik.
  Ugyanebben a helyi YAML-ban él a helyi primerprofil és a kézi helyi primerkiegészítés is.
  A közös, követett primerfelülírások mértékadó fájlja a data/primary-registry-overrides.yaml.
  A helyi overlay kizárólag a .local/nevnapok.local.yaml.
  A TUI ICS nézete és a Primer audit helyi beállítási drawerje ezt a közös helyi YAML-t írja.
  Az egyfájlos ICS mindig minden névnapot tartalmaz; ebben a módban nincs primerbontás.
  A Normalizált és a Rangsor módosító a Primer auditban véglegesül.
  Bontott ICS-nél a generálás automatikusan újrafuttatja a Primer auditot, és a véglegesített audit snapshotból készít külön elsődleges és külön további naptárat.

Táblázatos exportok:
  A csv export UTF-8 BOM-mal és pontosvesszős tagolással készül, hogy Excelben is jól nyíljon meg.
  Az excel export egy több munkalapos .xlsx fájlt készít Nevnapok, Napok és Meta lapokkal.

Példák táblázatos exportokra:
  nevnapok kimenet general csv
  nevnapok kimenet general excel
`
    )
    .action(async (formatum, opciok) => {
      if (formatum === "ics") {
        const tiltottIcsKapcsolok = [
          ["--input", opciok.input != null],
          ["--output", opciok.output != null],
          ["--primary-output", opciok.primaryOutput != null],
          ["--rest-output", opciok.restOutput != null],
          ["--scope", opciok.scope != null],
          ["--layout", opciok.layout != null],
          ["--rest-handling", opciok.restHandling != null],
          ["--rest-layout", opciok.restLayout != null],
          ["--leap-profile", opciok.leapProfile != null],
          ["--from-year", opciok.fromYear != null],
          ["--until-year", opciok.untilYear != null],
          ["--base-year", opciok.baseYear != null],
          ["--description", opciok.description != null],
          ["--description-format", opciok.descriptionFormat != null],
          ["--ordinal-day", opciok.ordinalDay != null],
          ["--include-other-days", opciok.includeOtherDays === true],
          ["--calendar-name", opciok.calendarName != null],
          ["--local-primary-overrides", opciok.localPrimaryOverrides != null],
          ["--mode", opciok.mode != null],
          ["--split-primary-rest", opciok.splitPrimaryRest === true],
          ["--primary-calendar-mode", opciok.primaryCalendarMode != null],
          ["--rest-calendar-mode", opciok.restCalendarMode != null],
          ["--primary-source", opciok.primarySource != null],
          ["--leap-mode", opciok.leapMode != null],
          ["--leap-strategy", opciok.leapStrategy != null],
          ["--no-other-days", opciok.otherDays === false],
        ];
        const hasznaltTiltottKapcsolo = tiltottIcsKapcsolok.find(([, hasznalva]) => hasznalva)?.[0];

        if (hasznaltTiltottKapcsolo) {
          throw new Error(
            `A ${hasznaltTiltottKapcsolo} kapcsoló megszűnt az ICS publikus felületén. Az ICS-profilt mostantól a .local/nevnapok.local.yaml kezeli.`
          );
        }
      }

      const eredmeny = await generalKimenetet(formatum, opciok);
      if (Array.isArray(eredmeny) && eredmeny.length > 0) {
        printDataTable(
          "Létrehozott kimenetek",
          [{ key: "utvonal", title: "Útvonal", width: 96 }],
          eredmeny.map((utvonal) => ({ utvonal }))
        );
      }
    });

  const auditParancs = program.command("audit").description("Auditok és riportok futtatása.");

  auditParancs
    .command("futtat <ellenorzes>")
    .description("Lefuttatja a kiválasztott auditot.")
    .addHelpText(
      "after",
      `
Elérhető auditok:
  ${listazAuditokat().join(", ")}
`
    )
    .action(async (ellenorzes) => {
      await futtatAuditot(ellenorzes);
    });

  const primerAuditParancs = auditParancs
    .command("primer")
    .description("Az egységes primer audit összképe és a helyi primer overlay véglegesítése.");

  primerAuditParancs
    .action(async () => {
      const adat = await betoltPrimerAuditAdata();
      const kiemeltNapok = primerAuditKiemeltNapSorok(adat);

      printKeyValueTable(
        "Primer audit összegzés",
        [
          ["Riport", adat.reportPath],
          ["Generálva", adat.generatedAt ?? "—"],
          ["Napok", adat.summary?.rowCount ?? 0],
          ["Közös hiányzó nevek", adat.summary?.combinedMissingCount ?? 0],
          ["Helyben nyitott hiányzók", adat.summary?.effectiveMissingCount ?? 0],
          ["Helyben nyitott napok", adat.summary?.effectiveMissingDayCount ?? 0],
          ["Helyben feloldott hiányzók", adat.summary?.locallyResolvedMissingCount ?? 0],
          ["Helyi overlay nevek", adat.summary?.localSelectedCount ?? 0],
          ["Fel nem oldott kézi nevek", adat.summary?.localOnlySelectedCount ?? 0],
          ["Figyelmeztetéses napok", adat.summary?.warningDayCount ?? 0],
          ["Kemény hibák", adat.summary?.hardFailureCount ?? 0],
          ["Helyi primerforrás", adat.personal?.settingsSnapshot?.primarySource ?? "default"],
          [
            "Normalizált módosító",
            adat.personal?.settingsSnapshot?.modifiers?.normalized ? "be" : "ki",
          ],
          [
            "Rangsor módosító",
            adat.personal?.settingsSnapshot?.modifiers?.ranking ? "be" : "ki",
          ],
        ],
        {
          keyWidth: 24,
          valueWidth: 72,
        }
      );

      if (kiemeltNapok.length > 0) {
        printDataTable(
          "Kiemelt napok",
          [
            { key: "nap", title: "Nap", width: 8 },
            { key: "primerek", title: "Végső primerek", width: 28 },
            { key: "forras", title: "Forrás", width: 20 },
            { key: "hianyzo", title: "Hiányzó", width: 10 },
            { key: "helyi", title: "Helyi", width: 10 },
          ],
          kiemeltNapok
        );
      }
    });

  primerAuditParancs
    .command("reszletek")
    .description("Egy adott nap primer audit részleteit jeleníti meg.")
    .requiredOption("--nap <MM-DD>", "A részletezni kívánt nap, például 04-18.")
    .addOption(
      new Option("--resz <szekcio>", "A megjelenítendő primer audit szekció.")
        .choices(["osszefoglalo", "forrasok", "hianyzok", "szemelyes"])
        .makeOptionMandatory()
    )
    .option("--snapshot", "A meglévő primer audit snapshotot olvassa újrafuttatás nélkül.", false)
    .action(async (opciok) => {
      const adat = await betoltPrimerAuditAdata({
        frissitRiport: opciok.snapshot !== true,
      });
      const row = keresPrimerAuditSort(adat, opciok.nap);

      if (!row) {
        throw new Error(`A primer audit nem tartalmazza ezt a napot: ${opciok.nap}`);
      }

      nyomtatPrimerAuditReszleteket(row, opciok.resz);
    });

  const primerAuditHelyiParancs = primerAuditParancs
    .command("helyi")
    .description("A nem követett helyi primerprofil módosítása.");

  primerAuditHelyiParancs
    .command("hozzaad <monthDay> <nev>")
    .description("Egy nevet hozzáad a helyi primerhez az adott napon.")
    .action(async (monthDay, nev) => {
      const eredmeny = await hozzaadHelyiPrimerKiegeszitest({ monthDay, name: nev });
      printKeyValueTable(
        "Helyi primer – hozzáadás",
        [
          ["Nap", eredmeny.monthDay],
          ["Név", eredmeny.name],
          ["Állapot", eredmeny.changed ? "hozzáadva" : "már be volt jelölve"],
          ["Helyi konfig", eredmeny.localOverridesPath],
        ],
        {
          keyWidth: 14,
          valueWidth: 60,
        }
      );
    });

  primerAuditHelyiParancs
    .command("torol <monthDay> <nev>")
    .description("Egy nevet eltávolít a helyi primerből az adott napon.")
    .action(async (monthDay, nev) => {
      const eredmeny = await torolHelyiPrimerKiegeszitest({ monthDay, name: nev });
      printKeyValueTable(
        "Helyi primer – törlés",
        [
          ["Nap", eredmeny.monthDay],
          ["Név", eredmeny.name],
          ["Állapot", eredmeny.changed ? "eltávolítva" : "nem volt bejelölve"],
          ["Helyi konfig", eredmeny.localOverridesPath],
        ],
        {
          keyWidth: 14,
          valueWidth: 60,
        }
      );
    });

  primerAuditHelyiParancs
    .command("forras <forras>")
    .description("Beállítja a helyi primerforrás-profilt.")
    .action(async (forras) => {
      if (!["default", "legacy", "ranked", "either"].includes(forras)) {
        throw new Error("A helyi primerforrás csak default, legacy, ranked vagy either lehet.");
      }

      const eredmeny = await allitSajatPrimerForrast(forras);
      printKeyValueTable(
        "Helyi primerforrás",
        [
          ["Primerforrás", eredmeny.primarySource],
          ["Helyi konfig", eredmeny.localOverridesPath],
        ],
        {
          keyWidth: 14,
          valueWidth: 40,
        }
      );
    });

  primerAuditHelyiParancs
    .command("modosito <modosito> <allapot>")
    .description("Be- vagy kikapcsol egy helyi primer módosítót.")
    .action(async (modosito, allapot) => {
      if (!["normalized", "ranking"].includes(modosito)) {
        throw new Error("A módosító csak normalized vagy ranking lehet.");
      }

      if (!["be", "ki"].includes(allapot)) {
        throw new Error("A módosító állapota csak be vagy ki lehet.");
      }

      const eredmeny = await allitSajatPrimerModositot(modosito, allapot === "be");
      printKeyValueTable(
        "Helyi primer módosító",
        [
          ["Módosító", eredmeny.modifier],
          ["Állapot", eredmeny.enabled ? "bekapcsolva" : "kikapcsolva"],
          ["Helyi konfig", eredmeny.localOverridesPath],
        ],
        {
          keyWidth: 14,
          valueWidth: 40,
        }
      );
    });

  const integracioParancs = program
    .command("integracio")
    .description("Külső integrációkhoz tartozó adminisztrációs parancsok.");

  integracioParancs
    .command("google-naptar")
    .description("Google Naptárhoz kapcsolódó integrációs parancsok.")
    .command("torol")
    .description("A meglévő Google Naptár törlő munkafolyamat elsődleges meghívója.")
    .allowUnknownOption(true)
    .argument("[tovabbiArgumentumok...]", "Minden további argumentum változatlanul továbbadásra kerül.")
    .action(async (tovabbiArgumentumok = []) => {
      await torolGoogleNaptarat(tovabbiArgumentumok);
    });

  program
    .command("tui")
    .description("Interaktív Ink-alapú varázsló és áttekintő.")
    .option(
      "--nezet <azonosito>",
      "Kezdő nézet: menu, primer-audit vagy ics",
      "menu"
    )
    .action(async (opciok) => {
      await futtatTui({ kezdoNezet: opciok.nezet });
    });

  return program;
}

/**
 * A `futtatCli` elindítja a parancssori felületet a megadott argumentumokkal.
 */
export async function futtatCli(argv = process.argv) {
  const program = letrehozCliProgram();
  await program.parseAsync(argv);
}

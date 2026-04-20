/**
 * cli/program.mjs
 * Az elsődleges CLI definíciója.
 */

import { Command, Help, Option } from "commander";
import picocolors from "picocolors";
import {
  futtatAuditot,
  futtatPipeline,
  generalKimenetet,
  listazAuditokat,
  listazKimenetiFormatumokat,
  listazPipelineCelLista,
  pipelineAllapot,
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
  nevnapok audit futtat primer-nelkul-marado-nevek
  nevnapok tui
  nevnapok tui --nezet primer-szerkeszto
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
  Ugyanebben a helyi YAML-ban él a személyes primerprofil és a kézi helyi primerkiegészítés is.
  A TUI ICS nézete és a Saját primer szerkesztő ezt a közös helyi YAML-t írja.
  Egyszerre pontosan egy aktív ICS kimenet mód él: közös, primer+további külön vagy személyes.
  A személyes primerprofil csak akkor hat a generálásra, ha a mentett profil személyes ICS módra van állítva.

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
      "Kezdő nézet: menu, primer-szerkeszto, ics, audit-vegso-primer-inspector vagy audit-primer-nelkul-inspector",
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

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
    .option("--primary-output <utvonal>", "A szétválasztott elsődleges naptár célútvonala.")
    .option("--rest-output <utvonal>", "A szétválasztott további névnapok naptárának célútvonala.")
    .option("--split-primary-rest", "Az elsődleges és a további névnapokat külön kimenetbe bontja.")
    .option(
      "--mode <mod>",
      "ICS mód: together, separate, primary-together, primary-together-with-rest, primary-separate, primary-separate-with-rest."
    )
    .addOption(
      new Option(
        "--primary-source <forras>",
        "Kompatibilitási kapcsoló a személyes primerforrás egyszeri felülírására."
      ).hideHelp()
    )
    .option("--primary-calendar-mode <mod>", "Split esetén: grouped/together vagy separate.")
    .option("--rest-calendar-mode <mod>", "Split esetén: grouped/together vagy separate.")
    .option("--leap-mode <mod>", "Szökőéves mód: none vagy hungarian-until-2050.")
    .option("--leap-strategy <strategia>", "Szökőéves stratégia: a, b vagy both.")
    .option("--from-year <ev>", "Szökőéves tartomány kezdőéve.", Number)
    .option("--until-year <ev>", "Szökőéves tartomány záróéve.", Number)
    .option("--base-year <ev>", "A nem szökőéves ismétlődő események báziséve.", Number)
    .option("--description <mod>", "Leírásmód: none, compact vagy detailed.")
    .option("--description-format <formatum>", "Leírásformátum: text, html vagy full.")
    .option("--ordinal-day <mod>", "Az év napja megjelenítése: none, summary vagy description.")
    .option("--include-other-days", "A leírásban a további névnapok is szerepeljenek.")
    .option("--calendar-name <nev>", "Az ICS naptár neve.")
    .option(
      "--local-primary-overrides [utvonal]",
      "ICS esetén a helyi primerkiegészítések fájlja; útvonal nélkül az alapértelmezett helyi YAML."
    )
    .addHelpText(
      "after",
      `
Elérhető formátumok:
  ${listazKimenetiFormatumokat().join(", ")}

Megjegyzés:
  Ha létezik helyi primerkiegészítés a data/primary-registry-overrides.local.yaml fájlban,
  az ICS generálás a közös nevnapok.ics mellett egy saját primeres nevnapok-sajat.ics fájlt is előállít.
  A személyes primerforrás alapértelmezett kezelése a TUI Saját primer szerkesztő nézetében történik.
  A régi --primary-source kapcsoló kompatibilitási okból továbbra is működik, de nem ez az ajánlott workflow.

Táblázatos exportok:
  A csv export UTF-8 BOM-mal és pontosvesszős tagolással készül, hogy Excelben is jól nyíljon meg.
  Az excel export egy több munkalapos .xlsx fájlt készít Nevnapok, Napok és Meta lapokkal.

Példa régi, részletes ICS-vezérlésre:
  nevnapok kimenet general ics \\
    --split-primary-rest --primary-calendar-mode separate --rest-calendar-mode grouped \\
    --leap-mode hungarian-until-2050 --from-year 2025 --until-year 2040 \\
    --description detailed --description-format text --ordinal-day description --include-other-days

Példák táblázatos exportokra:
  nevnapok kimenet general csv
  nevnapok kimenet general excel
`
    )
    .action(async (formatum, opciok) => {
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

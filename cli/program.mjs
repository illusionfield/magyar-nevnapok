// cli/program.mjs
// A kanonikus CLI definíciója.

import { Command, Help } from "commander";
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
  nevnapok tui
`
    );

  const pipelineParancs = program
    .command("pipeline")
    .description("A kanonikus pipeline állapotának megtekintése és futtatása.");

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
    .addHelpText(
      "after",
      `
Elérhető formátumok:
  ${listazKimenetiFormatumokat().join(", ")}
`
    )
    .action(async (formatum) => {
      const eredmeny = await generalKimenetet(formatum);
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
    .description("A meglévő Google Naptár törlő munkafolyamat kanonikus meghívója.")
    .allowUnknownOption(true)
    .argument("[tovabbiArgumentumok...]", "Minden további argumentum változatlanul továbbadásra kerül.")
    .action(async (tovabbiArgumentumok = []) => {
      await torolGoogleNaptarat(tovabbiArgumentumok);
    });

  program
    .command("tui")
    .description("Interaktív Ink-alapú varázsló és áttekintő.")
    .action(async () => {
      await futtatTui();
    });

  return program;
}

export async function futtatCli(argv = process.argv) {
  const program = letrehozCliProgram();
  await program.parseAsync(argv);
}

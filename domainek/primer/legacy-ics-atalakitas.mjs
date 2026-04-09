/**
 * domainek/primer/legacy-ics-atalakitas.mjs
 * A legacy ICS fájlból elsődleges primerjegyzéket előállító folyamat.
 */
import path from "node:path";
import {
  buildPrimaryRegistryPayload,
  DEFAULT_LEGACY_ICS_PATH,
  DEFAULT_PRIMARY_REGISTRY_PATH,
} from "./alap.mjs";
import { mentStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";

const args = parseArgs(process.argv.slice(2));

/**
 * A `main` a modul közvetlen futtatási belépési pontja.
 */
async function main() {
  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_LEGACY_ICS_PATH);
  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_PRIMARY_REGISTRY_PATH);
  const payload = await buildPrimaryRegistryPayload({ inputPath });

  await mentStrukturaltFajl(outputPath, payload);

  console.log(`Mentve: ${payload.days.length} legacy primer nap ide: ${outputPath}`);
}

/**
 * A `parseArgs` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input" && argv[index + 1]) {
      options.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--output" && argv[index + 1]) {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    }
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

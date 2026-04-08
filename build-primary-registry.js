import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPrimaryRegistryPayload,
  DEFAULT_LEGACY_ICS_PATH,
  DEFAULT_PRIMARY_REGISTRY_PATH,
} from "./lib/primary-registry.js";

const args = parseArgs(process.argv.slice(2));

async function main() {
  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_LEGACY_ICS_PATH);
  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_PRIMARY_REGISTRY_PATH);
  const payload = await buildPrimaryRegistryPayload({ inputPath });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Saved ${payload.days.length} legacy primary day(s) to ${outputPath}`);
}

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

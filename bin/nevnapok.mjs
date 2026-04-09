#!/usr/bin/env node

import { futtatCli } from "../cli/program.mjs";

futtatCli().catch((error) => {
  console.error(error?.stack ?? error?.message ?? error);
  process.exitCode = 1;
});

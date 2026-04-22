import { createConsoleReporter } from "../kozos/reporter.mjs";
import { futtatPipeline } from "../domainek/szolgaltatasok.mjs";

await futtatPipeline("teljes", {
  confirmCrawlerRun: true,
  reporter: createConsoleReporter(),
});

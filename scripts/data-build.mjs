import { createConsoleReporter } from "../kozos/reporter.mjs";
import { futtatPipeline } from "../domainek/szolgaltatasok.mjs";

await futtatPipeline("teljes", {
  reporter: createConsoleReporter(),
});

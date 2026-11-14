import { Command } from "commander";

import { db } from "./src/db";
import { listCompanies, runAutoMatching } from "./src/matcher";

async function main() {
  const program = new Command();
  program
    .option("--all", "Run for every company")
    .option("--siren <siren>", "Run for one company SIREN")
    .parse();

  const opts = program.opts<{ all?: boolean; siren?: string }>();

  if (Boolean(opts.all) === Boolean(opts.siren)) {
    console.error("Provide exactly one of --all or --siren <siren>");
    program.outputHelp();
    process.exitCode = 1;
    return;
  }

  if (opts.siren && !/^\d{9}$/.test(opts.siren)) {
    console.error(`Invalid SIREN: expected 9 digits, got "${opts.siren}"`);
    process.exitCode = 1;
    return;
  }

  const sirens = opts.all
    ? (await listCompanies()).map((c) => c.siren)
    : [opts.siren!];

  if (sirens.length === 0) {
    console.error("No company found");
    process.exitCode = 1;
    return;
  }

  let matched = 0;
  let leftOpen = 0;
  let errors = 0;

  for (const siren of sirens) {
    const summary = await runAutoMatching(siren);
    matched += summary.matched;
    leftOpen += summary.leftOpen;
    errors += summary.errors;
  }

  if (sirens.length > 1) {
    console.log(`TOTAL: matched=${matched} left_open=${leftOpen} errors=${errors}`);
  }

  if (errors > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.end());

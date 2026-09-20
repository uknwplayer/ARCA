#!/usr/bin/env node
import { main } from "../src/cli.ts";

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`ARCA_ERROR: ${error.message}\n`);
  if (process.env.ARCA_DEBUG === "1") process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

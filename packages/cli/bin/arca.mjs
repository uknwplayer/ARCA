#!/usr/bin/env node
import { main } from "../src/cli.ts";
import { runTermuxChat } from "../src/termux-chat.ts";

const argv=process.argv.slice(2);
const task=argv[0]==="chat"?runTermuxChat(argv.slice(1)):main(argv);

task.catch((error) => {
  process.stderr.write(`ARCA_ERROR: ${error.message}\n`);
  if (process.env.ARCA_DEBUG === "1") process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

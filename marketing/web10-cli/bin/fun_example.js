#! /usr/bin/env node
const args = process.argv.slice(2);
const helpMSG = 'Try "npx web10-cli commands" to see cli options.\n'
if (args.length == 0) {
  console.error(
    '\nError : No arguments provided.'
  );
  console.error(
    helpMSG
  )
  process.exit(1); //an error occurred
}

if (args[0] == "help") {
  console.log("possible shit...");
  process.exit(0); //no errors occurred
}

process.exit(0);
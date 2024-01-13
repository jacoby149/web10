#!/usr/bin/env node

/* Import other commands */
const help = require('./help.js');
const create = require('./create.js');
const invalid = require('./invalid.js');

const args = process.argv.slice(2);

if (args.length==0){
  invalid.invalid();
} 
else if (args[0]=='help'){
  help.help();
}
else if (args[0]=='create'){
  create.create();
}
else {
  invalid.invalid();
}
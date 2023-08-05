#!/usr/bin/env node

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptUser() {
  rl.question('How can I assist you? ', (answer) => {
    // Process the user's input
    if (answer.toLowerCase().includes('hello')) {
      console.log('Hello there!');
    } else if (answer.toLowerCase().includes('goodbye')) {
      console.log('Goodbye, have a nice day!');
      rl.close();
      return;
    } else {
      console.log('I\'m sorry, I don\'t understand. Can you please rephrase?');
    }

    // Continue the conversation recursively
    promptUser();
  });
}

promptUser();
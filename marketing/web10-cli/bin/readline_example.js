const readline = require('readline');

function create() {
    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    function promptUser() {
        readlineInterface.question('How can I assist you? ', (answer) => {
            // Process the user's input
            if (answer.toLowerCase().includes('hello')) {
                console.log('Hello there!');
            } else if (answer.toLowerCase().includes('goodbye')) {
                console.log('Goodbye, have a nice day!');
                readlineInterface.close();
                return;
            } else {
                console.log('I\'m sorry, I don\'t understand. Can you please rephrase?');
            }

            // Continue the conversation recursively
            promptUser();
        });
    }
    promptUser();
}

exports.create = create;
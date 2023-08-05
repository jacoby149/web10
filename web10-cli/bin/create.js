const inquirer = require('inquirer');
const chalk = require('chalk');

async function create() {

    /* Choice of template */
    const templateOptions = ['Notes App', 'Mail App'];
    console.log("Which template would you like?")
    const templateAnswer = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedOption',
            message: 'Select an option:',
            choices: templateOptions,
        },
    ]);
    console.log(`You selected: ${templateAnswer.selectedOption}`);
    console.log('')

    /* Choice of framework */
    const frameworkOptions = ['Vanilla JS + HTML + CSS', 'React'];
    console.log("Which framework would you like?")
    const frameworkAnswer = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedOption',
            message: 'Select an option:',
            choices: frameworkOptions,
        },
    ]);
    console.log(`You selected: ${frameworkAnswer.selectedOption}`);
    console.log('')

    /* Choice of Folder Name */
    console.log("Folder Name")
    const folderAnswser = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'What will the folder be named?',
        },
    ]);
    console.log(`Your folder will be named ${folderAnswser.name}`)
    console.log('')

    /* Final messages */
    const greenCheck = chalk.green('\u2713');
    console.log(`${greenCheck} success.`)
    console.log(`Creating Folder : (${folderAnswser.name})`);
    console.log(`Creating your app : (${templateAnswer.selectedOption})`)
    console.log(`App Created in framework : (${frameworkAnswer.selectedOption})`)
    console.log('')
}

exports.create = create;
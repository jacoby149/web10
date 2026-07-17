const inquirer = require('inquirer');
const chalk = require('chalk');
const fs = require('fs');
const fileCopy = require('./fileCopy')

async function chooseFramework(frameworkOptions){
    console.log("Which framework would you like?")
    const framework =
        (await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedOption',
                message: 'Select an option:',
                choices: Object.keys(frameworkOptions),
            },
        ])).selectedOption;
    console.log(`You selected: ${framework}`);
    console.log('')
    return framework;
}

async function chooseTemplate(templateOptions){
    console.log("Which template would you like?")
    const template = (await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedOption',
            message: 'Select an option:',
            choices: Object.keys(templateOptions),
        },
    ])).selectedOption;
    console.log(`You selected: ${template}`);
    console.log('')
    return template;
}

async function chooseFolderName(){
    /* Choice of Folder Name */
    console.log("Folder Name")
    const folderAnswser = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'What will the folder be named? (app)',
        },
    ]);
    const folderName = folderAnswser.name == '' ? 'app' : folderAnswser.name;
    console.log(`Your folder will be named ${folderName}`)
    console.log('')
    return folderName;
}

async function create() {
    /* Choices for App Creation */
    const createOptions = {
        'Vanilla JS + HTML + CSS': {
            'dir': 'vanilla',
            'templates': {
                'Todo App': {
                    'dir': 'todoApp'
                }
            }
        },
        'React': {
            'dir': 'react',
            'templates': {
                'Notes App': {
                    'dir': 'notesApp'
                }
            }
        }
    }

    const framework = await chooseFramework(createOptions);
    const templateOptions = createOptions[framework]['templates']
    const template = await chooseTemplate(templateOptions);
    const folderName = await chooseFolderName();

    /* Final messages */
    const greenCheck = chalk.green('\u2713');
    console.log(`${greenCheck} success.`)
    console.log(`Creating Folder : (${folderName})`);
    fs.mkdirSync(folderName)

    console.log(`Creating your app : (${template})`)
    
    const frameworkDir = createOptions[framework]['dir'];
    const templateDir = templateOptions[template]['dir'];
    fileCopy.createTemplate(folderName, frameworkDir, templateDir)

    console.log(`App Created in framework : (${framework})`)
    console.log('')
}

exports.create = create;
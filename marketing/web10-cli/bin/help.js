function help(){
    console.log("")
    console.log("possible arguments to 'npx web10-cli'")
    console.log("'help' - a help menu of possible web10 cli commands")
    console.log("'create' - create a web10 app")
    console.log("")
    process.exit(0); //no errors occurred
};

exports.help = help;
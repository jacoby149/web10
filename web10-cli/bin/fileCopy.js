// https://medium.com/@pongsatt/how-to-build-your-own-project-templates-using-node-cli-c976d3109129
const path = require('path');
const fs = require('fs');

function createTemplate(projectName, framework, template) {
    const templatePath = path.join(__dirname, 'templates', framework, template);
    src = templatePath
    dest = path.join("./",projectName)
    fs.cpSync(src, dest, {recursive: true});
}

exports.createTemplate = createTemplate;
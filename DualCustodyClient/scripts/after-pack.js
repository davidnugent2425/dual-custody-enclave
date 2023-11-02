const { exec } = require('child_process');

module.exports = async function(params) {
    exec('node launch.js', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return;
        }

        if (stderr) {
            console.error(`Stderr: ${stderr}`);
            return;
        }

        console.log(`Stdout: ${stdout}`);
    });
}

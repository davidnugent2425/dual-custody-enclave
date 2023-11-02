// launch.js
const { exec } = require('child_process');

exec('open dist/mac-arm64/DualCustodyClient.app', (error, stdout, stderr) => {
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

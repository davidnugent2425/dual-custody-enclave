const { app, BrowserWindow, ipcMain, protocol, shell } = require('electron');  // Import protocol
const Evervault = require('@evervault/sdk');
const evervault = new Evervault('app_hello', 'donal', { curve: 'prime256v1'});

let win;  // Make win a global variable

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: __dirname + '/preload.js'
        }
    });

    // win.loadFile('index.html');
    win.loadFile('login.html');
}

function initiateLogin() {
    const auth0Domain = 'https://dev-s3fbj5e02s08godo.us.auth0.com';
    const clientId = 'Bxm4IrLptD04TXxs9xt3JJC3TDxQ860b';
    const redirectUri = encodeURIComponent('dual-custody://callback');
    const responseType = 'code';
    const scope = 'openid';

    const authUrl = `${auth0Domain}/authorize?response_type=${responseType}&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;

    // This opens the URL in the user's default web browser.
    shell.openExternal(authUrl);
}

app.on('open-url', (event, url) => {
    event.preventDefault();
    // Parse the URL or take any other action needed
    if (url.includes('dual-custody://callback')) {
        win.loadFile('index.html');  // Switch to the main app view
        // After loading index.html, send the URL data to the renderer process
        win.webContents.on('did-finish-load', () => {
            win.webContents.send('auth-callback', url);
        });
    }
});

app.whenReady().then(() => {
    createWindow();
});

ipcMain.on('initiate-login', () => {
    initiateLogin();
});

ipcMain.handle('generate-wallet', async (event, apiKey) => {
    try {
        await evervault.enableCagesBeta({'dual-custody': {
            pcr8: 'a9e454447479505a278b88d11a94bef0708133f0189b58aaa8e8635871963f6d9d022f22c9e052ce6a0885add31d029c'
        }});

        const response = await fetch('https://dual-custody.app-80eeb9f27e5b.cages.evervault.com/generate_wallet', {
            method: 'GET',
            headers: {
                'API-Key': apiKey,
            },
        });

        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
});

ipcMain.handle('sign-transaction', async (event, { base64Part, fromAccount, toAccount, apiKey }) => {
    await evervault.enableCagesBeta({'dual-custody': {
        pcr8: 'a9e454447479505a278b88d11a94bef0708133f0189b58aaa8e8635871963f6d9d022f22c9e052ce6a0885add31d029c'
    }});
    const url = 'https://dual-custody.app-80eeb9f27e5b.cages.evervault.com/sign_transaction';
    const body = JSON.stringify({ base64_part: base64Part, from_account: fromAccount, to_account: toAccount });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'API-Key': apiKey,
            },
            body,
        });
        
        if (!response.ok) {
            throw new Error('Failed to sign transaction');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
});

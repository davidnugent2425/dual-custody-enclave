const { app, BrowserWindow, ipcMain, protocol, shell } = require('electron');  // Import protocol
const Evervault = require('@evervault/sdk');
const evervault = new Evervault('app_hello', 'donal', { curve: 'prime256v1'});
const log = require('electron-log');
const { v4: uuidv4 } = require('uuid');
const url = require('url');

let win;  // Make win a global variable

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: __dirname + '/preload.js'
        }
    });

    // win.loadFile('index.html');
    win.loadFile('login.html');
    win.maximize();
}

function initiateLogin() {
    const auth0Domain = 'https://dev-s3fbj5e02s08godo.us.auth0.com';
    const clientId = 'Bxm4IrLptD04TXxs9xt3JJC3TDxQ860b';
    const redirectUri = encodeURIComponent('dual-custody://callback');
    const responseType = 'token id_token';
    const audience = 'https://dual-custody-backend.davidnugent2425.repl.co'
    const scope = 'openid';
    const nonce = uuidv4();

    const authUrl = `${auth0Domain}/authorize?response_type=${responseType}&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&audience=${audience}&nonce=${nonce}`;

    // This opens the URL in the user's default web browser.
    shell.openExternal(authUrl);
}

app.on('open-url', (event, urlStr) => {
    event.preventDefault();
    if (urlStr.includes('dual-custody://callback')) {
        const hash = url.parse(urlStr).hash.substring(1);  // Remove leading '#'
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const idToken = params.get('id_token');

        if (accessToken && idToken) {
            storeTokens(accessToken, idToken);
            win.loadFile('index.html');
        } else {
            log.error('Failed to retrieve tokens');
        }
    }
});

global.tokens = {
    accessToken: null,
    idToken: null
};

function storeTokens(accessToken, idToken) {
    global.tokens.accessToken = accessToken;
    global.tokens.idToken = idToken;
}

global.pcrs = {};

ipcMain.on('store-pcrs', (event, pcrValues) => {
    log.info('storing pcrs')
    global.pcrs = pcrValues;
});

async function generateWalletToken() {
    const accessToken = global.tokens.accessToken;  // assuming tokens are stored in global object as shown before
  
    if (!accessToken) {
      log.error('Access token is not available.');
      return null;
    }
  
    const response = await fetch('https://dual-custody-backend.davidnugent2425.repl.co/get-token/generate-wallet', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  
    if (!response.ok) {
      log.error(`Failed to retrieve wallet token: ${response.statusText}`);
      return null;
    }
  
    const data = await response.json();
    return data.jwt;
}

async function generateTransactionToken(fromAccount, toAccount, amount) {
    const accessToken = global.tokens.accessToken; // assuming tokens are stored in global object as shown before

    if (!accessToken) {
        console.error('Access token is not available.');
        return null;
    }

    if (!fromAccount || !toAccount) {
        console.error('From account or to account is not provided.');
        return null;
    }

    const response = await fetch('https://dual-custody-backend.davidnugent2425.repl.co/get-token/transaction', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from_account: fromAccount,
            to_account: toAccount,
            amount: amount
        }),
    });

    if (!response.ok) {
        console.error(`Failed to retrieve transaction token: ${response.statusText}`);
        return null;
    }

    const data = await response.json();
    return data.jwt;
}

app.whenReady().then(() => {
    createWindow();
});

ipcMain.on('initiate-login', () => {
    initiateLogin();
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('generate-wallet', async (event) => {
    try {
        const cageToken = await generateWalletToken();

        await evervault.enableCagesBeta({'dual-custody': {
            pcr0: global.pcrs.PCR0,
            pcr1: global.pcrs.PCR1,
            pcr2: global.pcrs.PCR2,
            pcr8: global.pcrs.PCR8
        }});
        log.info('sending generate wallet request to cage', cageToken);

        const response = await fetch('https://dual-custody-cage.app-80eeb9f27e5b.cage.evervault.com/generate_wallet', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${cageToken}`,
            },
        });

        log.info('response received')

        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        log.error('Error:', error);
        throw error;
    }
});

ipcMain.handle('sign-transaction', async (event, { base64Part, fromAccount, toAccount, amount }) => {
    await evervault.enableCagesBeta({'dual-custody': {
        pcr0: global.pcrs.PCR0,
        pcr1: global.pcrs.PCR1,
        pcr2: global.pcrs.PCR2,
        pcr8: global.pcrs.PCR8
    }});
    const url = 'https://dual-custody-cage.app-80eeb9f27e5b.cage.evervault.com/sign_transaction';
    const body = JSON.stringify({ base64_part: base64Part });

    try {
        const cageToken = await generateTransactionToken(fromAccount, toAccount, amount);
        log.info('sending transaction request to cage', cageToken);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cageToken}`,
            },
            body,
        });
        log.info('transaction response received')
        
        if (!response.ok) {
            throw new Error('Failed to sign transaction');
        }

        const data = await response.json();
        return data;
    } catch (error) {
        log.error('Error:', error);
        throw error;
    }
});

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const Evervault = require('@evervault/sdk');
const evervault = new Evervault('app_hello', 'donal', { curve: 'prime256v1' });
const log = require('electron-log');
const { v4: uuidv4 } = require('uuid');
global.isCagesConfigured = false; // flag to track if cages have been configured

let mainWindow;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: `${__dirname}/preload.js`
        }
    });

    mainWindow.loadFile('login.html');
    mainWindow.maximize();
}

function initiateLogin() {
    const authUrl = 'https://dev-s3fbj5e02s08godo.us.auth0.com/authorize?' +
        'response_type=token%20id_token&' +
        `client_id=Bxm4IrLptD04TXxs9xt3JJC3TDxQ860b&` +
        `redirect_uri=${encodeURIComponent('dual-custody://callback')}&` +
        'scope=openid&' +
        `audience=https://dual-custody-backend.davidnugent2425.repl.co&` +
        `nonce=${uuidv4()}`;
    shell.openExternal(authUrl);
}

function storeTokens(accessToken, idToken) {
    global.tokens = { accessToken, idToken };
}

async function makeApiRequest(url, method, headers, body = null) {
    try {
        const response = await fetch(url, {
            method,
            headers,
            ...(body && { body: JSON.stringify(body) })
        });
        return response.json();
    } catch (error) {
        log.error('Error during API request:', error);
        throw error;
    }
}

function validateAccessToken() {
    const accessToken = global.tokens.accessToken;
    if (!accessToken) {
        throw new Error('Access token is not available.');
    }
    return accessToken;
}

async function generateWalletToken() {
    const accessToken = validateAccessToken();
    const url = 'https://dual-custody-backend-davidnugent2425.replit.app/get-token/generate-wallet';
    const headers = { 'Authorization': `Bearer ${accessToken}` };

    return makeApiRequest(url, 'GET', headers).then(data => data.jwt);
}

async function generateTransactionToken(fromAccount, toAccount, amount) {
    const accessToken = validateAccessToken();
    const url = 'https://dual-custody-backend-davidnugent2425.replit.app/get-token/transaction';
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };
    const body = { from_account: fromAccount, to_account: toAccount, amount: amount };

    return makeApiRequest(url, 'POST', headers, body).then(data => data.jwt);
}

function handleAuthCallback(urlStr) {
    const hash = new URL(urlStr).hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');

    if (accessToken && idToken) {
        storeTokens(accessToken, idToken);
        mainWindow.loadFile('index.html');
    } else {
        log.error('Failed to retrieve tokens');
    }
}

async function configureCagesBeta(pcrValues) {
    const requiredPcrKeys = ['PCR0', 'PCR1', 'PCR2', 'PCR8'];

    // Validate that all required PCR keys are present
    for (const key of requiredPcrKeys) {
        if (!pcrValues.hasOwnProperty(key)) {
            throw new Error(`Missing required PCR value: ${key}`);
        }
    }

    // Explicitly set the necessary PCR values
    await evervault.enableEnclaves({
        'dual-custody-enclave': {
            pcr0: pcrValues.PCR0,
            pcr1: pcrValues.PCR1,
            pcr2: pcrValues.PCR2,
            pcr8: pcrValues.PCR8
        }
    });

    global.isCagesConfigured = true; // Set flag to indicate cages are configured
}

// Electron app event handlers
app.on('ready', createMainWindow);

app.on('open-url', (event, urlStr) => {
    event.preventDefault();
    if (urlStr.includes('dual-custody://callback')) {
        handleAuthCallback(urlStr);
    }
});

ipcMain.on('initiate-login', initiateLogin);

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.on('store-pcrs', async (event, pcrValues) => {
    try {
        log.info('Storing PCRs and configuring cages');
        await configureCagesBeta(pcrValues);
    } catch (error) {
        log.error('Failed to configure cages with PCRs:', error);
    }
});

ipcMain.handle('generate-wallet', async () => {
    try {
        if (!global.isCagesConfigured) {
            throw new Error('Cages have not been configured yet. Please store PCR values first.');
        }
        const cageToken = await generateWalletToken();

        const walletUrl = 'https://dual-custody-enclave.app-80eeb9f27e5b.enclave.evervault.com/generate_wallet';
        const walletHeaders = { 'Authorization': `Bearer ${cageToken}` };

        const walletResponse = await makeApiRequest(walletUrl, 'GET', walletHeaders);
        return walletResponse;
    } catch (error) {
        log.error('Error in generate-wallet handler:', error);
        throw error;
    }
});

ipcMain.handle('sign-transaction', async (event, { base64Part, fromAccount, toAccount, amount }) => {
    try {
        if (!global.isCagesConfigured) {
            throw new Error('Cages have not been configured yet. Please store PCR values first.');
        }

        const cageToken = await generateTransactionToken(fromAccount, toAccount, amount);

        const transactionUrl = 'https://dual-custody-enclave.app-80eeb9f27e5b.enclave.evervault.com/sign_transaction';
        const transactionHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cageToken}`
        };
        const transactionResponse = await makeApiRequest(transactionUrl, 'POST', transactionHeaders, { base64_part: base64Part });
        return transactionResponse;
    } catch (error) {
        log.error('Error in sign-transaction handler:', error);
        throw error;
    }
});
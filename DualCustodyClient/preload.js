// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
    'electronAPIs', {
        generateWallet: async (apiKey) => {
            return ipcRenderer.invoke('generate-wallet', apiKey);
        },
        signTransaction: async (base64Part, fromAccount, toAccount, apiKey) => {
            return ipcRenderer.invoke('sign-transaction', { base64Part, fromAccount, toAccount, apiKey });
        },
        initiateLogin: () => {
            ipcRenderer.send('initiate-login');
        },
        listenForAuthCallback: (callback) => {
            ipcRenderer.on('auth-callback', (event, url) => {
                callback(url);
            });
        },
    }
);

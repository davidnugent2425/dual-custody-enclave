// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
    'electronAPIs', {
        generateWallet: async (apiKey) => {
            return ipcRenderer.invoke('generate-wallet');
        },
        signTransaction: async (base64Part, fromAccount, toAccount, amount) => {
            return ipcRenderer.invoke('sign-transaction', { base64Part, fromAccount, toAccount, amount });
        },
        initiateLogin: () => {
            ipcRenderer.send('initiate-login');
        },
        openExternal: (url) => {
            ipcRenderer.send('open-external', url);
        },
        storePcrs: (pcrs) => {
            ipcRenderer.send('store-pcrs', pcrs);
        }
    }
);

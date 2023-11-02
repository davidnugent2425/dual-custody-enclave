electronAPIs.listenForAuthCallback((url) => {
    // Parse the URL data to extract the Auth0 info
    // and use it for further requests to your backend.
    console.log(url)
});

async function generateWallet() {
    const apiKey = document.getElementById('apiKey').value;
    if (!apiKey) {
        alert('Please enter an API Key');
        return;
    }

    try {
        const data = await electronAPIs.generateWallet(apiKey);
        console.log(data);
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `
            Encrypted Private Key: ${data.encrypted_private_key}<br>
            Encrypted Base64 Part: ${data.encrypted_base64_part}<br>
            Public Key: ${data.public_key}<br>
            Ethereum Address: ${data.ethereum_address}
        `;
    } catch (error) {
        console.error('Error:', error);
    }
}

async function signTransaction() {
    const base64Part = document.getElementById('base64Part').value;
    const fromAccount = document.getElementById('fromAccount').value;
    const apiKey = document.getElementById('apiKey').value;
    const toAccount = document.getElementById('toAccount').value;

    if (!base64Part || !fromAccount || !toAccount || !apiKey) {
        alert('Please enter all required fields');
        return;
    }

    try {
        const result = await electronAPIs.signTransaction(base64Part, fromAccount, toAccount, apiKey);
        const resultDiv = document.getElementById('transactionResult');
        resultDiv.innerHTML = JSON.stringify(result, null, 2);
    } catch (error) {
        console.error('Error:', error);
    }
}

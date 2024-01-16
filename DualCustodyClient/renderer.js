async function generateWallet() {
    try {
        const data = await electronAPIs.generateWallet();
        const resultDiv = document.getElementById('result');
        // Set the result content.
        const resultContent = `
            <div class="result-item"><strong>Encrypted Share:</strong> ${data.encrypted_share}</div>
            <div class="result-item"><strong>Public Key:</strong> ${data.public_key}</div>
            <div class="result-item"><strong>Ethereum Address:</strong> ${data.ethereum_address}</div>
        `;

        // Check if result content is not empty and update the DOM.
        if (resultContent.trim() !== '') {
            resultDiv.innerHTML = resultContent;
            resultDiv.style.display = 'block'; // Make the div visible
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function signTransaction() {
    const base64Part = document.getElementById('base64Part').value;
    const fromAccount = document.getElementById('fromAccount').value;
    const toAccount = document.getElementById('toAccount').value;
    const amount = document.getElementById('amount').value;

    if (!base64Part || !fromAccount || !toAccount || !amount) {
        alert('Please enter all required fields.');
        return;
    }

    try {
        const result = await electronAPIs.signTransaction(base64Part, fromAccount, toAccount, amount);
        const resultDiv = document.getElementById('transactionResult');
        // Check if the transaction_hash key exists in the result object and update the DOM.
        if (result.transaction_hash) {
            const etherscanUrl = `https://sepolia.etherscan.io/tx/${result.transaction_hash}`;
            resultDiv.innerHTML = `
                <div class="result-item">
                    <strong>Transaction Hash:</strong>
                    <a href="#" onclick="electronAPIs.openExternal('${etherscanUrl}'); return false;">
                        ${result.transaction_hash}
                    </a>
                </div>`;
            resultDiv.style.display = 'block'; // Make the div visible
        } else {
            resultDiv.innerHTML = '<div class="result-item">No transaction hash found.</div>';
            resultDiv.style.display = 'block'; // Show the div even if there's no hash
        }
    } catch (error) {
        console.error('Error:', error);
    }
}



document.addEventListener('DOMContentLoaded', function() {
    fetch('https://gist.githubusercontent.com/davidnugent2425/237cde6d019338712c1b8075e614a94d/raw/pcrs.json')
      .then(response => response.json())
      .then(data => {
        displayCageMeasurements(data);
      })
      .catch(error => console.error('Error fetching cage measurements:', error));
  });
  
function displayCageMeasurements(data) {
    const pcrValuesElement = document.getElementById('pcrValues');
    const prettyTimestampElement = document.getElementById('prettyTimestamp');
    const deploymentLinkElement = document.getElementById('deploymentLink');

    // Display PCR values
    let pcrValuesHtml = '';
    for (const key in data.measurements) {
        if (data.measurements.hasOwnProperty(key) && key !== "HashAlgorithm") { // Skip "HashAlgorithm"
            pcrValuesHtml += `<div class="result-item"><strong>${key}:</strong> ${data.measurements[key]}</div>`;
        }
    }
    pcrValuesElement.innerHTML = pcrValuesHtml;
    const pcrs = {
        PCR0: data.measurements.PCR0,
        PCR1: data.measurements.PCR1,
        PCR2: data.measurements.PCR2,
        PCR8: data.measurements.PCR8
    };
    electronAPIs.storePcrs(pcrs);

    // Display pretty-printed timestamp
    const timestamp = new Date(data.timestamp);
    prettyTimestampElement.textContent = `Deployment Timestamp: ${timestamp.toLocaleString()}`;

    // Set the hyperlink for deployment and add an event listener
    deploymentLinkElement.textContent = 'Deployment'; // Set link text
    deploymentLinkElement.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent the default behavior
        const url = data.deployment_url;
        electronAPIs.openExternal(url); // Send message to main process
    });
}
  

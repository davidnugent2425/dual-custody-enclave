from flask import Flask, jsonify, request
import os
from eth_keys import keys
from pyshamir import split, combine
from web3 import Web3, exceptions
import base64
import requests

infura_api_key = os.environ.get('INFURA_API_KEY')
infura_url = f'https://sepolia.infura.io/v3/{infura_api_key}' 
web3 = Web3(Web3.HTTPProvider(infura_url))  

app = Flask(__name__)

@app.route('/generate_wallet', methods=['GET'])
def generate_wallet():
    # Generate a random private key
    private_key = keys.PrivateKey(os.urandom(32))
    public_key = private_key.public_key
    eth_address = public_key.to_checksum_address()

    # Split to get a list of byte arrays which can be combined later to re-generate the secret
    parts = split(private_key.to_bytes(), 2, 2)

    # Convert the shares to Base64 strings for convenient storage
    base64_parts = [base64.b64encode(part).decode('utf-8') for part in parts]

    # Prepare the data to be encrypted
    encryption_payload = {
        'private_key': str(private_key),
        'base64_parts': base64_parts
    }

    # Send a POST request to the encryption service
    encryption_response = requests.post('http://127.0.0.1:9999/encrypt', json=encryption_payload)

    # Check for a successful response
    if encryption_response.status_code != 200:
        return jsonify(error="Encryption service failed"), 500

    # Extract the encrypted data from the response
    encrypted_data = encryption_response.json()

    # Prepare the data to be sent to the Replit backend server
    backend_payload = {
        'ethereum_address': eth_address,
        'encrypted_base64_part': encrypted_data.get('base64_parts')[0]  # Send the first encrypted base64 part
    }

    # Send a POST request to the Replit backend server
    backend_response = requests.post('https://dual-custody-backend.davidnugent2425.repl.co/store_shard', json=backend_payload)

    # Check for a successful response from the Replit backend server
    if backend_response.status_code != 200:
        return jsonify(error="Backend server failed"), 500

    # Construct a response dictionary to be sent back to the user
    response = {
        'encrypted_private_key': encrypted_data.get('private_key'),
        'encrypted_base64_part': encrypted_data.get('base64_parts')[1],  # Send the second encrypted base64 part to the user
        'public_key': str(public_key),
        'ethereum_address': eth_address
    }

    # Return the response dictionary as a JSON response
    return jsonify(response)

@app.route('/sign_transaction', methods=['POST'])
def sign_transaction():
    data = request.json
    base64_part = data.get('base64_part')
    from_account = data.get('from_account')
    to_account = data.get('to_account')

    # Convert the Base64 string back to a byte array
    byte_part = base64.b64decode(base64_part.encode('utf-8'))

    # Get the Ethereum address from the 'from_account' field
    ethereum_address = from_account

    # Send a request to your backend to get the second shard
    backend_url = 'https://dual-custody-backend.davidnugent2425.repl.co/get_shard'
    params = {'ethereum_address': ethereum_address}
    backend_response = requests.get(backend_url, params=params)

    # Check for a successful response
    if backend_response.status_code != 200:
        return jsonify(error='Failed to retrieve the second shard from the backend'), 500

    # Extract the second shard from the backend response
    backend_data = backend_response.json()
    second_base64_part = backend_data.get('encrypted_base64_part')
    if not second_base64_part:
        return jsonify(error='No second shard found for the given Ethereum address'), 404

    # Prepare the data to be decrypted
    decryption_payload = {
        'encrypted_base64_part': second_base64_part
    }

    # Send a POST request to the decryption service
    decryption_url = 'http://127.0.0.1:9999/decrypt'
    decryption_response = requests.post(decryption_url, json=decryption_payload)

    # Check for a successful response
    if decryption_response.status_code != 200:
        return jsonify(error="Decryption service failed"), 500

    # Extract the decrypted data from the response
    decrypted_data = decryption_response.json()
    decrypted_base64_part = decrypted_data.get('decrypted_base64_part')
    if not decrypted_base64_part:
        return jsonify(error='Decryption failed'), 500

    # Convert the decrypted Base64 string back to a byte array
    second_byte_part = base64.b64decode(decrypted_base64_part.encode('utf-8'))

    # Combine the two shards to reconstruct the private key
    byte_parts = [byte_part, second_byte_part]
    private_key = f'0x{combine(byte_parts).hex()}'

    try:
        from_account = web3.to_checksum_address(from_account)
    except exceptions.InvalidAddress:
        return jsonify(error=f"Invalid 'from_account' address: {from_account}"), 400

    try:
        to_account = web3.to_checksum_address(to_account)
    except exceptions.InvalidAddress:
        return jsonify(error=f"Invalid 'to_account' address: {to_account}"), 400

    nonce = web3.eth.get_transaction_count(from_account)
    tx = {
        'type': '0x2',
        'nonce': nonce,
        'from': from_account,
        'to': to_account,
        'value': web3.to_wei(0.01, 'ether'),
        'maxFeePerGas': web3.to_wei('250', 'gwei'),
        'maxPriorityFeePerGas': web3.to_wei('3', 'gwei'),
        'chainId': 11155111
    }
    gas = web3.eth.estimate_gas(tx)
    tx['gas'] = gas
    signed_tx = web3.eth.account.sign_transaction(tx, private_key)
    tx_hash = web3.eth.send_raw_transaction(signed_tx.rawTransaction)

    return jsonify(transaction_hash=str(web3.to_hex(tx_hash)))

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)

from flask import Flask, jsonify, request
import os
from eth_keys import keys
from pyshamir import split, combine
from web3 import Web3, exceptions
import base64
import requests
from jose import jwt, JWTError
import base64
from functools import wraps

infura_api_key = os.environ.get('INFURA_API_KEY')
infura_url = f'https://sepolia.infura.io/v3/{infura_api_key}' 
web3 = Web3(Web3.HTTPProvider(infura_url))  

base64_public_key = os.environ.get('TOKEN_SIGNING_PUBLIC_KEY')
if base64_public_key is None:
    raise ValueError("Public key is not set in the environment variable.")
# Decode the base64-encoded public key
token_signing_public_key = base64.b64decode(base64_public_key).decode('utf-8')

base64_cage_private_key = os.environ.get('CAGE_TOKEN_SIGNING_PRIVATE_KEY')
if base64_cage_private_key is None:
    raise ValueError("Cage private key is not set in the environment variable.")
# Decode the base64-encoded public key
cage_token_signing_private_key = base64.b64decode(base64_cage_private_key).decode('utf-8')

class JWTValidationError(Exception):
    pass

app = Flask(__name__)

def validate_and_double_sign_jwt(backend_signed_jwt):
    try:
        payload = {
            'backend_signed_jwt': backend_signed_jwt,
        }
        double_signed_token = jwt.encode(payload, cage_token_signing_private_key, algorithm='RS256')

        decoded_jwt = jwt.decode(backend_signed_jwt, token_signing_public_key, algorithms=['RS256'])

        return double_signed_token, decoded_jwt
    except JWTError as e:
        raise JWTValidationError(f'Invalid JWT: {str(e)}')

def require_jwt(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')

        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Invalid Authorization header format'}), 401

        token = auth_header[7:]

        try:
            token, decoded_jwt = validate_and_double_sign_jwt(token)
        except JWTValidationError as e:
            return jsonify({'error': str(e)}), 401

        return f(token, decoded_jwt, *args, **kwargs)

    return decorated_function

@app.route('/generate_wallet', methods=['GET'])
@require_jwt
def generate_wallet(double_signed_token, decoded_token):
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

    # Assign data policy to data
    headers = {
        'X-Evervault-Data-Role': 'private-key-shares'
    }

    # Send a POST request to the encryption service with the headers
    encryption_response = requests.post('http://127.0.0.1:9999/encrypt', json=encryption_payload, headers=headers)

    # Check for a successful response
    if encryption_response.status_code != 200:
        return jsonify(error="Encryption service failed"), 500

    # Extract the encrypted data from the response
    encrypted_data = encryption_response.json()

    # Prepare the data to be sent to the Replit backend server
    backend_payload = {
        'user_email': decoded_token['email'],
        'ethereum_address': eth_address,
        'encrypted_base64_part': encrypted_data.get('base64_parts')[0]  # Send the first encrypted base64 part
    }

    headers = {
        'Authorization': f'Bearer {double_signed_token}'
    }

    # Send a POST request to the Replit backend server
    backend_response = requests.post(
        'https://dual-custody-backend.davidnugent2425.repl.co/store_shard',
        json=backend_payload,
        headers=headers
    )

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
@require_jwt
def sign_transaction(double_signed_token, decoded_token):
    data = request.json
    base64_part = data.get('base64_part')
    from_account = decoded_token['from_account']
    to_account = decoded_token['to_account']
    amount = decoded_token['amount']

    # Convert the Base64 string back to a byte array
    byte_part = base64.b64decode(base64_part.encode('utf-8'))

    headers = {
        'Authorization': f'Bearer {double_signed_token}'
    }

    # Send a request to your backend to get the second shard
    backend_url = 'https://dual-custody-backend.davidnugent2425.repl.co/get_shard'
    backend_response = requests.get(backend_url, headers=headers)

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
        'base64_part': second_base64_part
    }

    # Send a POST request to the decryption service
    decryption_url = 'http://127.0.0.1:9999/decrypt'
    decryption_response = requests.post(decryption_url, json=decryption_payload)

    # Check for a successful response
    if decryption_response.status_code != 200:
        return jsonify(error="Decryption service failed"), 500

    # Extract the decrypted data from the response
    decrypted_data = decryption_response.json()
    decrypted_base64_part = decrypted_data.get('base64_part')
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
        'value': web3.to_wei(amount, 'ether'),
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

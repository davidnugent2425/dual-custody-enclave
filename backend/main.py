from flask import Flask, request, jsonify, g
import os
import time
import uuid
from jose import jwt
import base64

from auth0_auth import requires_auth
from double_signed_jwt_auth import require_double_signed_jwt
from replit import db

TOKEN_SIGNING_KEY = base64.b64decode(
    os.environ['TOKEN_SIGNING_KEY']).decode('utf-8')

app = Flask(__name__)


# Routes
@app.route('/store_shard', methods=['POST'])
@require_double_signed_jwt
def store_shard(decoded_token):
  # Get JSON data from the request
  data = request.json

  # Validate the 'purpose' in the token
  if decoded_token.get('purpose') != 'generate-wallet':
    return jsonify(message='Invalid token purpose'), 403

  # Extract the Ethereum address and encrypted base64 part from the JSON data
  ethereum_address = data.get('ethereum_address')
  encrypted_base64_part = data.get('encrypted_base64_part')

  # Get the id from the decoded token
  id = decoded_token.get('id')

  # Check if the 'keys' key exists for the id, if not create one
  if id not in db or 'keys' not in db[id]:
    db[id] = {'keys': {}}

  # Store the data under the 'keys' dictionary using the Ethereum address as the key
  db[id]['keys'][ethereum_address] = encrypted_base64_part

  # Print the extracted values to the console
  print(f'Ethereum Address: {ethereum_address}')
  print(f'Encrypted Base64 Part: {encrypted_base64_part}')

  # Return a success message as a JSON response
  return jsonify(message='Data received successfully')


@app.route('/get_shard', methods=['GET'])
@require_double_signed_jwt
def get_shard(decoded_token):
  # Validate the 'purpose' in the token
  if decoded_token.get('purpose') != 'transaction':
    return jsonify(error='Invalid token purpose'), 403

  # Extract the 'from_account' from the decoded token
  from_account = decoded_token.get('from_account')
  if not from_account:
    return jsonify(error='From account is required in the token'), 400

  # Get the id from the decoded token
  id = decoded_token.get('id')
  if not id:
    return jsonify(error='ID is required in the token'), 400

  # Check if the id and from_account exists in the database
  try:
    encrypted_base64_part = db[id]['keys'][from_account]
  except KeyError:
    return jsonify(error='No data found for the given from account'), 404

  # Return the encrypted base64 part as a JSON response
  response = {'encrypted_base64_part': encrypted_base64_part}
  return jsonify(response)


@app.route('/get-token/generate-wallet', methods=['GET'])
@requires_auth
def generate_wallet_token():
  id = g.auth_data['sub']
  # Set expiry time to 1 minute from now
  expiry_time = int(time.time()) + 3600
  # Create a nonce
  nonce = str(uuid.uuid4())
  # Store nonce in DB
  if 'nonces' not in db:
    db['nonces'] = {}
  db['nonces'][nonce] = True
  # Build the JWT payload
  payload = {
      'id': id,
      'nonce': nonce,
      'purpose': 'generate-wallet',
      'exp': expiry_time  # Expiry time claim
  }
  # Sign the payload and create the JWT
  token = jwt.encode(payload, TOKEN_SIGNING_KEY, algorithm='RS256')
  return jsonify({'jwt': token})


@app.route('/get-token/transaction', methods=['POST'])
@requires_auth
def create_transaction_token():
  # Get JSON payload from the request
  transaction_data = request.get_json()
  id = g.auth_data['sub']

  # Validate the JSON payload to ensure 'from_account', 'to_account', and 'amount' are provided
  if not transaction_data or 'from_account' not in transaction_data or 'to_account' not in transaction_data or 'amount' not in transaction_data:
    return jsonify({'error':
                    'Missing from_account, to_account, or amount'}), 400

  # Set expiry time to 1 minute from now
  expiry_time = int(time.time()) + 3600

  # Create a nonce
  nonce = str(uuid.uuid4())
  # Store nonce in DB
  if 'nonces' not in db:
    db['nonces'] = {}
  db['nonces'][nonce] = True

  # Build the JWT payload with the additional fields
  payload = {
      'id': id,
      'nonce': nonce,
      'purpose': 'transaction',
      'from_account': transaction_data['from_account'],
      'to_account': transaction_data['to_account'],
      'amount': transaction_data['amount'],  # Include the transaction amount
      'exp': expiry_time  # Expiry time claim
  }

  # Sign the payload and create the JWT
  token = jwt.encode(payload, TOKEN_SIGNING_KEY, algorithm='RS256')

  return jsonify({'jwt': token})


if __name__ == '__main__':
  app.run(host='0.0.0.0', debug=True)

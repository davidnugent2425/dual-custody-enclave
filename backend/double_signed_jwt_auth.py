from flask import request, jsonify
from functools import wraps
from jose import jwt, JWTError
import os
import base64
from replit import db

TOKEN_SIGNING_PUBLIC_KEY = base64.b64decode(
    os.environ['TOKEN_SIGNING_PUBLIC_KEY']).decode('utf-8')
ENCLAVE_TOKEN_SIGNING_PUBLIC_KEY = base64.b64decode(
    os.environ['ENCLAVE_TOKEN_SIGNING_PUBLIC_KEY']).decode('utf-8')

class JWTValidationError(Exception):
  pass


def validate_and_decode_double_signed_jwt(double_signed_jwt):
  """Validates and decodes a double-signed JWT (self-signed and Enclave-signed)."""
  try:
    backend_signed_jwt = jwt.decode(double_signed_jwt,
                                    ENCLAVE_TOKEN_SIGNING_PUBLIC_KEY,
                                    algorithms=['RS256'])['backend_signed_jwt']
    return jwt.decode(backend_signed_jwt,
                      TOKEN_SIGNING_PUBLIC_KEY,
                      algorithms=['RS256'])
  except JWTError as e:
    raise JWTValidationError(f'Invalid JWT: {str(e)}')


def use_nonce(nonce):
  """Validates and consumes a nonce."""
  nonces = db.get('nonces', {})
  if nonce in nonces:
    del nonces[nonce]
    db['nonces'] = nonces
    return True
  return False


def require_double_signed_jwt(f):
  """Decorator to validate double-signed JWTs."""

  @wraps(f)
  def decorated_function(*args, **kwargs):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
      return jsonify({'error': 'Invalid Authorization header format'}), 401

    token = auth_header[7:]
    try:
      decoded_jwt = validate_and_decode_double_signed_jwt(token)
      nonce = decoded_jwt.get('nonce')
      if not nonce or not use_nonce(nonce):
        return jsonify({'error': 'Invalid or already used nonce'}), 401
    except JWTValidationError as e:
      return jsonify({'error': str(e)}), 401

    return f(decoded_jwt, *args, **kwargs)

  return decorated_function

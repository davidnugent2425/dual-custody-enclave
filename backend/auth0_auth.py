from flask import request, jsonify, g
from functools import wraps
from jose import jwt, JWTError
import json
from six.moves.urllib.request import urlopen
import os
import base64

# Your Auth0 configurations and constants
AUTH0_DOMAIN = 'https://dev-s3fbj5e02s08godo.us.auth0.com'
API_AUDIENCE = 'https://dual-custody-backend.davidnugent2425.repl.co'
ALGORITHMS = ["RS256"]

class AuthError(Exception):

  def __init__(self, error, status_code):
    self.error = error
    self.status_code = status_code


def get_token_auth_header():
  """Extracts the Access Token from the Authorization Header."""
  auth = request.headers.get("Authorization", None)
  if not auth:
    raise AuthError(
        {
            "code": "authorization_header_missing",
            "description": "Authorization header is expected"
        }, 401)

  parts = auth.split()
  if parts[0].lower() != "bearer":
    raise AuthError(
        {
            "code": "invalid_header",
            "description": "Authorization header must start with Bearer"
        }, 401)
  elif len(parts) == 1:
    raise AuthError(
        {
            "code": "invalid_header",
            "description": "Token not found"
        }, 401)
  elif len(parts) > 2:
    raise AuthError(
        {
            "code": "invalid_header",
            "description": "Authorization header must be Bearer token"
        }, 401)

  return parts[1]


def validate_auth0_token(token):
  """Validates Auth0 token."""
  jsonurl = urlopen(AUTH0_DOMAIN + "/.well-known/jwks.json")
  jwks = json.loads(jsonurl.read())
  unverified_header = jwt.get_unverified_header(token)
  rsa_key = next(
      (key for key in jwks["keys"] if key["kid"] == unverified_header["kid"]),
      None)

  if rsa_key:
    try:
      return jwt.decode(token,
                        rsa_key,
                        algorithms=ALGORITHMS,
                        audience=API_AUDIENCE,
                        issuer=AUTH0_DOMAIN + "/")
    except jwt.ExpiredSignatureError:
      raise AuthError(
          {
              "code": "token_expired",
              "description": "token is expired"
          }, 401)
    except jwt.JWTClaimsError:
      raise AuthError(
          {
              "code":
              "invalid_claims",
              "description":
              "incorrect claims, please check the audience and issuer"
          }, 401)
    except Exception:
      raise AuthError(
          {
              "code": "invalid_header",
              "description": "Unable to parse authentication token."
          }, 401)
  raise AuthError(
      {
          "code": "invalid_header",
          "description": "Unable to find appropriate key"
      }, 401)


def requires_auth(f):
  """Decorator to validate Auth0 Access Tokens."""

  @wraps(f)
  def decorated(*args, **kwargs):
    token = get_token_auth_header()
    payload = validate_auth0_token(token)
    g.auth_data = payload
    return f(*args, **kwargs)

  return decorated

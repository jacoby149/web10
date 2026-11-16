#!/usr/bin/python3
"""Cleanup-only doctl-compatible transport for the isolated guardian.

Exact API route/verb allowlist; short-lived OAuth access renews using only the
separately granted cleanup context. No creation, resize, volume or credential API.
"""
from datetime import datetime
import fcntl
import http.client
import json
import os
from pathlib import Path
import ssl
import sys
import time
from urllib.parse import urlencode, urlsplit

AUTH = Path('/opt/web10-guardian/cleanup-auth.json')
SCOPES = {'account:read', 'actions:read', 'droplet:read', 'droplet:delete', 'firewall:read',
    'firewall:delete', 'ssh_key:read', 'ssh_key:delete', 'image:read', 'regions:read', 'sizes:read', 'snapshot:read'}


def route(args):
    if args[:4] != ['--http-retry-max', '0', '--output', 'json']:
        raise ValueError('fixed cleanup transport arguments required')
    args = args[4:]
    if args == ['account', 'get']:
        return 'GET', '/v2/account', 'account'
    if len(args) < 3 or args[0] != 'compute':
        raise ValueError('cleanup transport operation denied')
    kind, action = args[1:3]
    resource = {'droplet': 'droplets', 'firewall': 'firewalls', 'ssh-key': 'account/keys'}.get(kind)
    if resource is None:
        raise ValueError('cleanup transport resource denied')
    if action == 'list' and len(args) == 3:
        return 'GET', '/v2/' + resource + '?per_page=200', {'droplet': 'droplets', 'firewall': 'firewalls', 'ssh-key': 'ssh_keys'}[kind]
    if len(args) not in (4, 5):
        raise ValueError('exact cleanup ID required')
    identifier = args[3]
    import re
    if not re.fullmatch(r'[0-9]+' if kind != 'firewall' else r'[a-f0-9-]{36}', identifier):
        raise ValueError('invalid cleanup resource ID')
    if action == 'get' and len(args) == 4 and kind == 'droplet':
        return 'GET', '/v2/' + resource + '/' + identifier, 'droplet'
    if action == 'delete' and len(args) == 5 and args[4] == '--force':
        return 'DELETE', '/v2/' + resource + '/' + identifier, None
    raise ValueError('cleanup transport verb denied')


def request(host, method, path, *, token=None, body=None):
    connection = http.client.HTTPSConnection(host, timeout=8, context=ssl.create_default_context())
    headers = {'Authorization': 'Bearer ' + token} if token else {'Content-Type': 'application/x-www-form-urlencoded'}
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read(4 * 1024**2 + 1)
        if len(data) > 4 * 1024**2 or response.status not in (200, 201, 204):
            raise RuntimeError('cleanup provider request denied')
        return json.loads(data) if data else None
    finally:
        connection.close()


def invoke(args, auth_path=AUTH):
    method, path, key = route(args)  # Reject before even reading a credential.
    with Path(str(auth_path) + '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        auth = json.loads(auth_path.read_bytes())
        if not set(auth['scope'].split()) <= SCOPES:
            raise ValueError('cleanup-only OAuth context required; broad context refused')
        if time.time() >= datetime.fromisoformat(auth['expires_at']).timestamp() - 60:
            endpoint = urlsplit(auth['token_endpoint'])
            if endpoint.scheme != 'https' or endpoint.netloc != 'cloud.digitalocean.com' or endpoint.path != '/v1/oauth/token':
                raise ValueError('fixed OAuth token endpoint required')
            value = request(endpoint.netloc, 'POST', endpoint.path,
                body=urlencode(dict(grant_type='refresh_token', refresh_token=auth['refresh_token'], client_id=auth['client_id'])))
            if value.get('scope') and not set(value['scope'].split()) <= SCOPES:
                raise ValueError('unexpected refreshed credential scope')
            from datetime import UTC
            auth.update(access_token=value['access_token'], refresh_token=value.get('refresh_token', auth['refresh_token']),
                expires_at=datetime.fromtimestamp(time.time() + int(value['expires_in']), UTC).isoformat())
            temporary = auth_path.with_suffix('.tmp')
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump(auth, stream)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(auth_path)
            fd = os.open(auth_path.parent, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        value = request('api.digitalocean.com', method, path, token=auth['access_token'])
        if key is None:
            return None
        if value.get('links', {}).get('pages', {}).get('next'):
            raise ValueError('cleanup inventory pagination exceeds admitted bounds')
        return value[key]


if __name__ == '__main__':
    try:
        print(json.dumps(invoke(sys.argv[1:])))
    except Exception:
        raise SystemExit('cleanup provider transport failed; credentials and response bodies withheld') from None

"""Private off-controller receipts via exact-key, expiring HTTPS capabilities."""
import hashlib
import http.client
import json
from pathlib import Path
import ssl
import sys
from urllib.parse import urlsplit

MAX_BYTES = 256 * 1024**2


def endpoint(url):
    value = urlsplit(url)
    if (value.scheme != 'https' or value.hostname != 'minio.web10.app' or value.port not in (None, 443)
            or value.username or value.password or value.fragment
            or not value.path.startswith('/web10-media/research/costfn/guardian/') or not value.query):
        raise ValueError('exact private guardian HTTPS capability required')
    return value


def publish(path, slot):
    path = Path(path)
    put, get = endpoint(slot['put']), endpoint(slot['get'])
    if put.path != get.path or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError('exact bounded checkpoint key required')
    with path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    try:
        connection = http.client.HTTPSConnection(put.hostname, timeout=5, context=ssl.create_default_context())
        try:
            with path.open('rb') as stream:
                connection.request('PUT', put.path + '?' + put.query, body=stream,
                    headers={'Content-Length': str(path.stat().st_size), 'If-None-Match': '*'})
                response = connection.getresponse()
                if response.status not in (200, 201, 204, 412):
                    raise ValueError('private checkpoint write rejected')
                response.read(1024)
        finally:
            connection.close()
        connection = http.client.HTTPSConnection(get.hostname, timeout=5, context=ssl.create_default_context())
        try:
            connection.request('GET', get.path + '?' + get.query)
            response = connection.getresponse()
            if response.status != 200:
                raise ValueError('private checkpoint readback rejected')
            actual, size = hashlib.sha256(), 0
            while data := response.read(1024**2):
                size += len(data)
                if size > MAX_BYTES:
                    raise ValueError('checkpoint readback exceeded bound')
                actual.update(data)
            if size != path.stat().st_size or actual.hexdigest() != digest:
                raise ValueError('private checkpoint readback bytes/digest differ')
        finally:
            connection.close()
    except Exception:
        raise RuntimeError('off-controller private checkpoint export/readback failed') from None
    return dict(key=get.path, sha256=digest, bytes=size, independently_read_back=True)


if __name__ == '__main__':
    try:
        print(json.dumps(publish(sys.argv[1], json.load(sys.stdin))))
    except Exception:
        raise SystemExit('off-controller checkpoint export failed; transport details withheld') from None

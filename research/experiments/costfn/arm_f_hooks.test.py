"""Drive actual nested FastAPI dispatch, not a fabricated flat route list."""
from functools import wraps
import unittest

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.testclient import TestClient

import arm_f_hooks as hooks


class HookTests(unittest.TestCase):
    def application(self):
        group, docs, v3 = APIRouter(), APIRouter(), APIRouter()
        calls = []

        def authorized(data: dict):
            if data.get('token') != 'synthetic-valid':
                raise HTTPException(403, 'denied')
            calls.append('original')
            return {'authorized': True}

        for path in hooks.MEMBERSHIP_PATHS:
            group.add_api_route(path.removeprefix('/v3/groups'), authorized, methods=['POST'])
        for path in hooks.DOCUMENT_PATHS:
            docs.add_api_route(path.removeprefix('/v3'), authorized, methods=['POST'])
        v3.include_router(group, prefix='/groups')
        v3.include_router(docs)
        app = FastAPI()
        app.include_router(v3, prefix='/v3')
        return app, calls

    def test_real_nested_dispatch_is_hooked_and_original_authorization_retained(self):
        app, calls = self.application()

        def install(route, *args):
            original = route.dependant.call

            @wraps(original)
            def wrapped(*args, **kwargs):
                result = original(*args, **kwargs)
                calls.append('hook')
                return result

            route.dependant.call = wrapped

        receipt = hooks.install(app, install, install)
        self.assertEqual(set(receipt['authorized_membership_routes']), hooks.MEMBERSHIP_PATHS)
        self.assertEqual(set(receipt['authorized_document_routes']), set(hooks.DOCUMENT_PATHS))
        with TestClient(app) as client:
            for path in sorted(hooks.MEMBERSHIP_PATHS | set(hooks.DOCUMENT_PATHS)):
                calls.clear()
                self.assertEqual(client.post(path, json={'token': 'synthetic-valid'}).status_code, 200)
                self.assertEqual(calls, ['original', 'hook'])
                calls.clear()
                self.assertEqual(client.post(path, json={'token': 'invalid'}).status_code, 403)
                self.assertEqual(calls, [])

    def test_missing_real_route_fails_before_installing_any_partial_hook(self):
        app = FastAPI()
        calls = []
        with self.assertRaisesRegex(RuntimeError, 'missing real F routes'):
            hooks.install(app, lambda *args: calls.append(args), lambda *args: calls.append(args))
        self.assertEqual(calls, [])

    def test_flat_routes_remain_supported(self):
        app, _ = self.application()
        routes = list(hooks.routes(app))
        flat = type('Flat', (), {'routes': routes})()
        self.assertEqual(list(hooks.routes(flat)), routes)


if __name__ == '__main__':
    unittest.main()

"""Install hooks on the route contexts FastAPI actually dispatches.

FastAPI 0.139 includes routers lazily: app.routes contains _IncludedRouter
branches, not the prefixed APIRoutes. Never replace a route or its dependencies.
"""
MEMBERSHIP_PATHS = {'/v3/groups/join', '/v3/groups/leave', '/v3/groups/members/add',
    '/v3/groups/members/remove', '/v3/groups/accept-invite', '/v3/groups/requests/join/approve'}
DOCUMENT_PATHS = {'/v3/update': 'update', '/v3/delete': 'delete', '/v3/attachment': 'attachment'}


def routes(app):
    for route in app.routes:
        effective = getattr(route, 'effective_route_contexts', None)
        if callable(effective):
            yield from (item for item in effective() if getattr(item, 'dependant', None) is not None)
        elif getattr(route, 'dependant', None) is not None:
            yield route


def install(app, membership, document):
    required = MEMBERSHIP_PATHS | set(DOCUMENT_PATHS)
    selected = {}
    for route in routes(app):
        if route.path in required and 'POST' in (route.methods or set()):
            if route.path in selected:
                raise RuntimeError('ambiguous real F route: ' + route.path)
            selected[route.path] = route
    if set(selected) != required:
        raise RuntimeError('missing real F routes: ' + ','.join(sorted(required - set(selected))))
    for path, route in selected.items():
        if path in MEMBERSHIP_PATHS:
            membership(route)
        else:
            document(route, DOCUMENT_PATHS[path])
    return {'authorized_membership_routes': sorted(MEMBERSHIP_PATHS),
            'authorized_document_routes': sorted(DOCUMENT_PATHS)}

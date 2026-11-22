"""Preserve the core thread-local connection lookup across research wrappers."""
from functools import wraps


def query_kwargs(signature, sql=None, *args, **kwargs):
    """Bind at ingress, then keep every driver option named through wrappers."""
    if sql is None:
        sql = kwargs.pop('query')
    return dict(signature.bind_partial(sql, *args, **kwargs).arguments)


def dispatch(get_client, method, signature_source):
    # wraps retains the driver's inspect.signature, not its bound connection.
    @wraps(signature_source)
    def call(*args, **kwargs):
        return getattr(get_client(), method)(*args, **kwargs)
    return call

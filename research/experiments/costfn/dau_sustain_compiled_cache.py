"""Bounded reuse of pure SQL rendering, never permissions or query results."""

from collections import OrderedDict
from threading import RLock


def freeze(value):
    kind = type(value)
    if value is None or kind in (str, int, bool):
        return kind.__name__, value
    if kind in (tuple, list):
        return kind.__name__, tuple(map(freeze, value))
    if kind in (set, frozenset):
        return kind.__name__, frozenset(map(freeze, value))
    if kind is dict and all(type(key) is str for key in value):
        # Do not reorder the actual compiler inputs even when a caller's
        # mapping emits byte-different aliases in a different order.
        return 'dict', tuple((key, freeze(item)) for key, item in value.items())
    raise TypeError('non-structural SQL compiler argument')


def memoize_sql(render, *, max_entries=512, max_bytes=32 * 1024**2):
    lock = RLock()
    storage = OrderedDict()
    used = 0

    def cached(*args, **kwargs):
        nonlocal used
        try:
            key = freeze((args, kwargs))
        except TypeError:
            return render(*args, **kwargs)
        with lock:
            hit = storage.get(key)
            if hit is not None:
                storage.move_to_end(key)
                return hit[0]
        value = render(*args, **kwargs)  # Validation errors are never cached.
        if type(value) is not str:
            return value
        size = len(repr(key).encode()) + len(value.encode())
        if size > max_bytes // 4:
            return value
        with lock:
            if key not in storage:
                storage[key] = value, size
                used += size
                while len(storage) > max_entries or used > max_bytes:
                    _, (_, dropped) = storage.popitem(last=False)
                    used -= dropped
        return value

    return cached

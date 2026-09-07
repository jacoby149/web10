# Platform importers — pure parsers: Takeout/export archive entries
# ((path, bytes) pairs) -> record dicts. The import worker
# (app/v3/services/import_worker.py) does the writing.

from .youtube import parse_youtube

PARSERS = {
    "youtube": parse_youtube,
}

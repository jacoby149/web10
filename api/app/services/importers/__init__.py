# Platform importers — pure parsers: Takeout/export archive entries
# ((path, bytes) pairs) -> record dicts. The import worker
# (app/v3/services/import_worker.py) does the writing.
#
# Two call shapes per platform:
#   parse_X(entries: list[(path, bytes)])         — the pure/list form (tests)
#   parse_X_streaming(entries: iterable[(path, fileobj)]) — the worker's form:
#     members are read file-like (row-by-row), so a multi-GB export's CSV is
#     never held whole in RAM.
# PARSERS maps platform -> the STREAMING form (what the worker calls).

from .youtube import parse_youtube, parse_youtube_streaming

PARSERS = {
    "youtube": parse_youtube_streaming,
}

"""Reuse exact validated candidate SQL after the live read compiler, only in DAU."""

from functools import lru_cache

from arm_satellite_sql import literal as q

_GROUP = '__dau_validated_group_template_e9690ee0__'
_LIMIT = 917305
_ORDER = ' ORDER BY created_at DESC,doc_id DESC,author_key DESC LIMIT '


def cached_candidate(original):
    @lru_cache(maxsize=192)
    def template(compiled):
        # Always start with the existing fully validating renderer. The exact
        # compiled SQL (principal, permission scope, policy and predicates) is
        # the cache key; no read authorization result is cached independently.
        result = original(compiled, _GROUP, None, _LIMIT)
        marker = 'WHERE group_id=' + q(_GROUP) + ' AND collection_name='
        if result.count(marker) != 1 or not result.endswith(_ORDER + str(_LIMIT)):
            raise ValueError('unexpected canonical candidate template')
        left, right = result[:-len(_ORDER + str(_LIMIT))].split(marker, 1)
        return left, right

    def render(compiled, group, after, limit):
        left, right = template(compiled)
        cursor = ''
        if after:
            timestamp = after['created_ms']
            if type(timestamp) is not int:
                raise ValueError('candidate cursor requires integer milliseconds')
            cursor = (' AND (created_at,doc_id,author_key)<(fromUnixTimestamp64Milli(' + str(timestamp) + '),'
                + q(after['doc_id']) + ',' + q(after['author_key']) + ')')
        if type(limit) is not int or limit < 1:
            raise ValueError('candidate limit must be a positive integer')
        return left + 'WHERE group_id=' + q(group) + ' AND collection_name=' + right + cursor + _ORDER + str(limit)

    return render

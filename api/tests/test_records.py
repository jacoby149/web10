"""Tests for record factory functions in services/records.py."""

import datetime

import app.settings as settings
from app.services import records


class TestStarRecord:
    def test_returns_dict(self):
        r = records.star_record()
        assert isinstance(r, dict)

    def test_has_service_star(self):
        r = records.star_record()
        assert r["service"] == "*"

    def test_has_username_placeholder(self):
        r = records.star_record()
        assert r["username"] == "USERNAME"

    def test_has_password_placeholder(self):
        r = records.star_record()
        assert r["hashed_password"] == "PASSWORD"

    def test_has_phone_placeholder(self):
        r = records.star_record()
        assert r["phone_number"] == "PHONE_NUMBER"

    def test_verified_false(self):
        r = records.star_record()
        assert r["verified"] is False

    def test_customer_id_none(self):
        r = records.star_record()
        assert r["customer_id"] is None

    def test_business_id_none(self):
        r = records.star_record()
        assert r["business_id"] is None

    def test_credit_limit_is_free(self):
        r = records.star_record()
        assert r["credit_limit"] == settings.FREE_CREDITS

    def test_space_limit_is_free(self):
        r = records.star_record()
        assert r["space_limit"] == settings.FREE_SPACE

    def test_credits_spent_zero(self):
        r = records.star_record()
        assert r["credits_spent"] == 0

    def test_last_replenish_is_datetime(self):
        r = records.star_record()
        assert isinstance(r["last_replenish"], datetime.datetime)


class TestServicesRecord:
    def test_returns_dict(self):
        r = records.services_record()
        assert isinstance(r, dict)

    def test_service_is_services(self):
        r = records.services_record()
        assert r["service"] == "services"

    def test_empty_whitelist(self):
        r = records.services_record()
        assert r["whitelist"] == []

    def test_empty_blacklist(self):
        r = records.services_record()
        assert r["blacklist"] == []


class TestPublicPostsTerm:
    """A13: the canonical anon-read term for public_posts."""

    def test_returns_dict(self):
        r = records.public_posts_term()
        assert isinstance(r, dict)

    def test_service_is_public_posts(self):
        r = records.public_posts_term()
        assert r["service"] == "public_posts"

    def test_whitelist_has_anon_read(self):
        r = records.public_posts_term()
        assert len(r["whitelist"]) == 1
        entry = r["whitelist"][0]
        assert entry["username"] == ".*"
        assert entry["provider"] == ".*"
        assert entry["read"] is True

    def test_empty_blacklist(self):
        r = records.public_posts_term()
        assert r["blacklist"] == []


class TestFollowsTerm:
    """Core services provisioning: follows term is owner-only."""

    def test_returns_dict(self):
        r = records.follows_term()
        assert isinstance(r, dict)

    def test_service_is_follows(self):
        r = records.follows_term()
        assert r["service"] == "follows"

    def test_empty_whitelist(self):
        r = records.follows_term()
        assert r["whitelist"] == []

    def test_empty_blacklist(self):
        r = records.follows_term()
        assert r["blacklist"] == []


class TestInboxTerm:
    """Core services provisioning: inbox allows create from anyone."""

    def test_service_is_inbox(self):
        r = records.inbox_term()
        assert r["service"] == "inbox"

    def test_whitelist_grants_create(self):
        r = records.inbox_term()
        assert len(r["whitelist"]) == 1
        entry = r["whitelist"][0]
        assert entry["username"] == ".*"
        assert entry["provider"] == ".*"
        assert entry["create"] is True


class TestReactionsTerm:
    def test_service_is_reactions(self):
        r = records.reactions_term()
        assert r["service"] == "reactions"

    def test_empty_whitelist(self):
        r = records.reactions_term()
        assert r["whitelist"] == []


class TestCommentsTerm:
    def test_service_is_comments(self):
        r = records.comments_term()
        assert r["service"] == "comments"

    def test_empty_whitelist(self):
        r = records.comments_term()
        assert r["whitelist"] == []


class TestDmsTerm:
    def test_service_is_dms(self):
        r = records.dms_term()
        assert r["service"] == "dms"

    def test_empty_whitelist(self):
        r = records.dms_term()
        assert r["whitelist"] == []


class TestCoreServicesTerms:
    def test_returns_list_of_five(self):
        terms = records.core_services_terms()
        assert len(terms) == 5

    def test_services_cover_follows_inbox_reactions_comments_dms(self):
        terms = records.core_services_terms()
        services = {t["service"] for t in terms}
        assert services == {"follows", "inbox", "reactions", "comments", "dms"}


class TestProfileTerm:
    """Core services provisioning: profile is anon-read (D40 pull model —
    the friends feed reads a friend's profile record directly)."""

    def test_service_is_profile(self):
        r = records.profile_term()
        assert r["service"] == "profile"

    def test_whitelist_grants_anon_read(self):
        r = records.profile_term()
        assert len(r["whitelist"]) == 1
        entry = r["whitelist"][0]
        assert entry["username"] == ".*"
        assert entry["provider"] == ".*"
        assert entry["read"] is True


class TestPublicMediaTerm:
    """Core services provisioning: public_media is anon-read (D35)."""

    def test_service_is_public_media(self):
        r = records.public_media_term()
        assert r["service"] == "public_media"

    def test_whitelist_grants_anon_read(self):
        r = records.public_media_term()
        assert len(r["whitelist"]) == 1
        entry = r["whitelist"][0]
        assert entry["read"] is True


class TestCoreServicesTerms:
    """The full core set provisioned at signup + by the migration."""

    def test_full_set(self):
        services = [t["service"] for t in records.core_services_terms()]
        assert services == [
            "follows",
            "inbox",
            "reactions",
            "comments",
            "dms",
            "profile",
            "public_media",
            "private_posts",
            "staging_posts",
            "media",
        ]

    def test_owner_only_terms_have_empty_whitelist(self):
        owner_only = {"follows", "reactions", "comments", "dms", "private_posts", "staging_posts", "media"}
        for t in records.core_services_terms():
            if t["service"] in owner_only:
                assert t["whitelist"] == [], t["service"]

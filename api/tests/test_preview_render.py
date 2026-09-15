"""Tests for the generic link-preview card renderer (KB: media/thumbnailing.md).

`POST /v3/preview/render` takes a card spec (title, description, image, url,
type) and returns the OG/Twitter HTML. It is **schema-free** — it knows nothing
about posts, profiles, or permalinks. The app supplies the content; the platform
renders the card. These pin that the renderer is generic (the D60 split: the
renderer is the platform's, the content is the app's).
"""

from fastapi.testclient import TestClient

from app.main import app as fastapi_app


def _client():
    return TestClient(fastapi_app)


def _render(client, **spec):
    base = {"title": "A title", "description": "A description", "url": "https://social.localhost/u/nova/p/abc"}
    base.update(spec)
    return client.post("/v3/preview/render", json=base)


class TestPreviewRender:
    def test_renders_og_tags_from_the_spec(self):
        resp = _render(
            _client(),
            title="Check out this clip",
            description="A great video",
            image="https://minio.web10.app/img.png",
            url="https://social.localhost/u/nova/p/abc",
        )
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
        body = resp.text
        assert 'property="og:title" content="Check out this clip"' in body
        assert 'property="og:description" content="A great video"' in body
        assert 'property="og:image" content="https://minio.web10.app/img.png"' in body
        assert 'property="og:url" content="https://social.localhost/u/nova/p/abc"' in body
        # A non-video card is an article.
        assert 'property="og:type" content="article"' in body

    def test_video_spec_renders_video_other(self):
        resp = _render(_client(), is_video=True)
        assert 'property="og:type" content="video.other"' in resp.text

    def test_explicit_og_type_wins(self):
        # The app can set any og:type (e.g. "profile" for a profile card) — the
        # renderer does not decide the type, it renders what the app says.
        resp = _render(_client(), og_type="profile")
        assert 'property="og:type" content="profile"' in resp.text

    def test_no_image_omits_the_image_tags(self):
        resp = _render(_client(), image=None)
        body = resp.text
        assert 'property="og:image"' not in body
        assert 'name="twitter:image"' not in body

    def test_image_alt_falls_back_to_title(self):
        resp = _render(_client(), image="https://minio.web10.app/img.png", image_alt=None)
        assert 'property="og:image:alt" content="A title"' in resp.text

    def test_image_alt_uses_the_spec_when_present(self):
        resp = _render(_client(), image="https://minio.web10.app/img.png", image_alt="a cat")
        assert 'property="og:image:alt" content="a cat"' in resp.text

    def test_twitter_card_mirrors_the_og_values(self):
        resp = _render(
            _client(),
            title="Mirrored",
            description="Twitter sees this",
            image="https://minio.web10.app/img.png",
        )
        body = resp.text
        assert 'name="twitter:card" content="summary_large_image"' in body
        assert 'name="twitter:title" content="Mirrored"' in body
        assert 'name="twitter:description" content="Twitter sees this"' in body
        assert 'name="twitter:image" content="https://minio.web10.app/img.png"' in body

    def test_special_characters_are_html_escaped(self):
        resp = _render(_client(), title='He said "hi" <b>& bye', description="a&b")
        body = resp.text
        # The raw special characters must not appear unescaped in the meta content.
        assert 'content="He said &quot;hi&quot; &lt;b&gt;&amp; bye"' in body
        assert 'content="a&amp;b"' in body

    def test_site_name_defaults_to_web10(self):
        resp = _render(_client())
        assert 'property="og:site_name" content="web10"' in resp.text

    def test_site_name_is_overridable(self):
        resp = _render(_client(), site_name="MyNode")
        assert 'property="og:site_name" content="MyNode"' in resp.text

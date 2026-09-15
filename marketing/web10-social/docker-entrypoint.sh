#!/bin/sh
# web10-social container entrypoint — runs the link-preview server (the
# social-specific tail of the generic thumbnailing primitive, KB:
# media/thumbnailing.md) alongside nginx.
#
# The preview server is a small Node process on PREVIEW_PORT (default 3001).
# The social nginx (the original nginx entrypoint, which envsubs the templates
# + serves the SPA) proxies known crawler User-Agents to it. This keeps the
# social app ONE service (one container, like today) — the card deploys with
# the app it represents, version with it, and dies with it.
#
# The node stays 100% generic (D60): it answers "what's the picture for this
# doc?" (media/thumbnail) and "render a card from this spec" (preview/render).
# The preview server is the social part — it maps the social permalink to a
# doc and supplies the card content.

# Start the preview server in the background.
node /app/preview/server.mjs &
PREVIEW_PID=$!

# Forward SIGTERM/SIGINT to the preview server so the container shuts down
# cleanly (nginx is the foreground process; without this the preview server
# would be orphaned on stop).
trap 'kill "$PREVIEW_PID" 2>/dev/null' TERM INT

# Run the original nginx entrypoint (envsubs the templates + runs nginx with
# the CMD). "$@" is the CMD (nginx -g "daemon off;").
exec /docker-entrypoint.sh "$@"

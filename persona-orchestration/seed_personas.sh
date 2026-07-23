#!/usr/bin/env bash
# Seed 5 persona accounts for live testing web10 social.
# Usage: bash seed_personas.sh [API_BASE]
#   API_BASE defaults to http://api.localhost:6000
#
# SUPERSEDED — use seed_personas.py instead. This bash script only does
# accounts + profiles + follows, and it hardcodes provider "api.localhost" /
# site "social.web10.app", so its follows/contacts are wrong against any
# non-localhost node and it does NOT seed the discovery feed (public_posts),
# the public ledger (reactions/comments), or DMs. The Python script derives
# provider/site from --api and implements the full post-D5.5 flow. See README.

set -euo pipefail

API="${1:-http://api.localhost:6000}"
PASS="web10test!2026"

PERSONAS=(
  "solar-flare-69|Solar Flare|Podcast host. Crypto degenerate. I will talk for 4 hours about anything. 🚀🌞"
  "noodle-empress|Noodle Empress|Ramen snob with a \$12 bowl budget. 3am food pics are a feature. 🍜✨"
  "void-walker|Void Walker|Reading Camus at 2am. Dark academia is a lifestyle. Also I like cats. 📚🖤"
  "butterfly-mechanic|Butterfly Mechanic|Fixing bugs and butterflies. DIY tutorials. Label your cables. 🦋🔧"
  "disco-donkey|Disco Donkey|Professional chaos agent. Dance memes only. No thoughts, just vibes. 🫏🕺"
)

echo "=== Seeding personas at $API ==="
echo

# Create accounts
echo "--- Signing up ---"
for p in "${PERSONAS[@]}"; do
  IFS='|' read -r uname dname bio <<< "$p"
  echo -n "  $uname ... "
  resp=$(curl -s -X POST "$API/signup" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$uname\",\"password\":\"$PASS\"}" 2>/dev/null || echo '{"data":"already exists"}')
  echo "ok ($resp)"
done
echo

# Login and get tokens
echo "--- Logging in ---"
declare -A TOKENS
for p in "${PERSONAS[@]}"; do
  IFS='|' read -r uname dname bio <<< "$p"
  token=$(curl -s -X POST "$API/web10token" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$uname\",\"password\":\"$PASS\",\"site\":\"social.web10.app\",\"target\":\"\"}" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
  if [ -n "$token" ]; then
    TOKENS["$uname"]="$token"
    echo "  $uname: logged in"
  else
    echo "  $uname: FAILED"
  fi
done
echo

# Set profiles
echo "--- Setting profiles ---"
for p in "${PERSONAS[@]}"; do
  IFS='|' read -r uname dname bio <<< "$p"
  token="${TOKENS[$uname]:-}"
  [ -z "$token" ] && continue
  curl -s -X POST "$API/$uname/profile" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$token\",\"query\":{\"display_name\":\"$dname\",\"bio\":\"$bio\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S%z)\"}}" > /dev/null
  echo "  $uname: profile set"
done
echo

# Cross-follow everyone
echo "--- Cross-following ---"
USERNAMES=()
for p in "${PERSONAS[@]}"; do
  IFS='|' read -r uname _ _ <<< "$p"
  USERNAMES+=("$uname")
done

for uname in "${USERNAMES[@]}"; do
  token="${TOKENS[$uname]:-}"
  [ -z "$token" ] && continue
  for target in "${USERNAMES[@]}"; do
    [ "$target" = "$uname" ] && continue
    # Add contact
    curl -s -X POST "$API/$uname/contacts" \
      -H "Content-Type: application/json" \
      -d "{\"token\":\"$token\",\"query\":{\"username\":\"$target\",\"provider\":\"api.localhost\",\"added_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S%z)\"}}" > /dev/null
    # Follow
    curl -s -X POST "$API/$uname/follows" \
      -H "Content-Type: application/json" \
      -d "{\"token\":\"$token\",\"query\":{\"username\":\"$target\",\"provider\":\"api.localhost\",\"status\":\"active\",\"followed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%S%z)\"}}" > /dev/null
  done
  echo "  $uname: following ${#USERNAMES[@]}-1 personas"
done
echo

echo "=== Done! ==="
echo "All personas created with password: $PASS"
echo ""
echo "Tokens:"
for uname in "${!TOKENS[@]}"; do
  echo "  $uname: ${TOKENS[$uname]:0:50}..."
done
echo ""
echo "For full content seeding (posts, comments, DMs, reactions), run:"
echo "  python3 seed_personas.py --api $API"
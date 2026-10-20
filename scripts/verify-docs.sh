#!/usr/bin/env bash
# Executes the commands published in the Schema-Watch docs against the real
# npm package and fails if any documented output or exit code has drifted.
#
#   Part 1 follows src/content/quickstart.mdx step by step.
#   Part 2 follows the workflow in src/content/guides/ci-contract-check.mdx.
#
# Usage: bash scripts/verify-docs.sh [schema-watch version, default: latest]
set -uo pipefail

VERSION="${1:-latest}"
SW="npx --yes schema-watch@${VERSION}"
WORK="$(mktemp -d)"
PIDS=()
FAILURES=0

kill_tree() { # npx runs the CLI as a child process, so stop descendants too
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}
cleanup() {
  for pid in "${PIDS[@]}"; do kill_tree "$pid"; done
  rm -rf "$WORK"
}
trap cleanup EXIT

pass() { printf '  \033[32mok\033[0m    %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

expect_contains() { # label, haystack, needle
  if grep -qF -- "$3" <<<"$2"; then pass "$1"; else fail "$1 (missing: $3)"; printf '%s\n' "$2" | sed 's/^/        /'; fi
}
expect_exit() { # label, actual, expected
  if [ "$2" -eq "$3" ]; then pass "$1 (exit $2)"; else fail "$1 (exit $2, expected $3)"; fi
}
wait_for() { # url
  for _ in $(seq 1 150); do curl -fsS -o /dev/null "$1" 2>/dev/null && return 0; sleep 0.2; done
  return 1
}
stop_api() {
  kill_tree "$API_PID"
  wait "$API_PID" 2>/dev/null || true
}

cd "$WORK"
echo "schema-watch@${VERSION} on $(node --version), working in $WORK"

# The sample API from the quickstart, verbatim.
cat > api.mjs <<'JS'
import http from 'node:http'

const v2 = process.env.V2 === '1'

http
  .createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url.startsWith('/api/users/')) {
      const id = req.url.split('/').pop()
      const body = v2
        ? { id: Number(id), name: 'Ada' }
        : { id, name: 'Ada', email: 'ada@example.com' }
      res.end(JSON.stringify(body))
    } else {
      res.statusCode = 404
      res.end('{}')
    }
  })
  .listen(3001, () => console.log(v2 ? 'API v2 on :3001' : 'API v1 on :3001'))
JS

echo
echo "Quickstart"

node api.mjs > api.log 2>&1 & API_PID=$!; PIDS+=("$API_PID")
wait_for http://localhost:3001/api/users/1 && pass "sample API v1 starts" || fail "sample API v1 starts"

out="$($SW init --target http://localhost:3001 2>&1)"
expect_contains "init writes the config" "$out" "schema-watch.config.json"
expect_contains "config has documented proxyPort" "$(cat schema-watch.config.json)" '"proxyPort": 4560'
expect_contains "config has documented apiPort" "$(cat schema-watch.config.json)" '"apiPort": 4561'

$SW start > proxy.log 2>&1 & PIDS+=("$!")
wait_for http://localhost:4560/api/users/1 && pass "proxy answers on :4560" || fail "proxy answers on :4560"
expect_contains "start prints the proxy banner" "$(cat proxy.log)" "schema-watch is watching."
expect_contains "dashboard is served on :4561" "$(curl -fsS http://localhost:4561/ 2>&1)" "<title>Schema-Watch</title>"

out="$(curl -fsS http://localhost:4560/api/users/42)"
expect_contains "v1 response through the proxy" "$out" '{"id":"42","name":"Ada","email":"ada@example.com"}'

mkdir -p .schema-watch
out="$($SW export --out .schema-watch/baseline.json 2>&1)"
expect_contains "export writes the baseline" "$out" "Wrote 1 contract entries to .schema-watch/baseline.json"
expect_contains "baseline uses the path pattern" "$(cat .schema-watch/baseline.json)" '"pathPattern": "/api/users/:id"'

stop_api
V2=1 node api.mjs > api.log 2>&1 & API_PID=$!; PIDS+=("$API_PID")
wait_for http://localhost:3001/api/users/1 && pass "sample API v2 starts" || fail "sample API v2 starts"

out="$(curl -fsS http://localhost:4560/api/users/42)"
expect_contains "v2 response through the proxy" "$out" '{"id":42,"name":"Ada"}'
expect_contains "dashboard API records the break" "$(curl -fsS http://localhost:4561/api/changes 2>&1)" '"severity":"BREAKING"'

echo
echo "Local dashboard API"
expect_contains "GET /api/health" "$(curl -fsS http://localhost:4561/api/health)" '{"ok":true}'
eps="$(curl -fsS http://localhost:4561/api/endpoints)"
expect_contains "GET /api/endpoints lists the pattern" "$eps" '"pathPattern":"/api/users/:id"'
expect_contains "GET /api/endpoints reports latestSeverity" "$eps" '"latestSeverity":"BREAKING"'
EID="$(node -pe 'JSON.parse(process.argv[1])[0].id' "$eps")"
chg="$(curl -fsS "http://localhost:4561/api/endpoints/$EID/changes")"
expect_contains "GET /api/endpoints/{id}/changes" "$chg" '"kind":"field-removed","path":"email","severity":"BREAKING"'
CID="$(node -pe 'JSON.parse(process.argv[1])[0].id' "$chg")"
code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4561/api/endpoints/nope/changes)"
expect_exit "unknown endpoint returns 404" "$code" 404
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:4561/api/endpoints/$EID/changes/$CID/ack")"
expect_exit "ack returns 204" "$code" 204
expect_contains "acknowledged change is flagged" "$(curl -fsS "http://localhost:4561/api/endpoints/$EID/changes")" '"acknowledged":true'

echo
echo "Quickstart, continued"
$SW export --out contract.json > /dev/null 2>&1
out="$($SW check --contract contract.json --baseline .schema-watch/baseline.json 2>&1)"; code=$?
expect_exit "check fails on the breaking change" "$code" 1
expect_contains "check names the endpoint" "$out" "BREAKING  GET /api/users/:id (response)"
expect_contains "check reports the type change" "$out" "id: string → number"
expect_contains "check reports the removal" "$out" "email was removed (was string)"
expect_contains "check prints the summary" "$out" "Breaking API contract changes detected."

mkdir -p web/src
echo 'export const getUser = (id) => fetch(`/api/users/${id}`).then((r) => r.json())' > web/src/user.js
out="$($SW check --contract contract.json --baseline .schema-watch/baseline.json --frontend-src web/src 2>&1)"
expect_contains "check lists the affected file" "$out" "affects: web/src/user.js"

echo
echo "Quickstart troubleshooting"

out="$($SW check --contract contract.json --baseline missing.json 2>&1)"; code=$?
expect_exit "missing baseline is an input error" "$code" 2
expect_contains "missing baseline message" "$out" "Contract file not found: missing.json"

out="$($SW start 2>&1)"
expect_contains "second proxy reports EADDRINUSE" "$out" "EADDRINUSE"

mkdir empty && pushd empty > /dev/null
$SW init --target http://localhost:3001 > /dev/null 2>&1
sed -i 's/"proxyPort": 4560/"proxyPort": 4570/; s/"apiPort": 4561/"apiPort": 4571/' schema-watch.config.json
$SW start > proxy.log 2>&1 & PIDS+=("$!")
wait_for http://localhost:4571/ || true
out="$($SW export 2>&1)"
expect_contains "export before traffic explains itself" "$out" "No contract captured yet"
popd > /dev/null

stop_api
out="$(curl -sS http://localhost:4560/api/users/42 2>&1)"
expect_contains "unreachable upstream message" "$out" "upstream request failed"

echo
echo "CI guide workflow"

mkdir ci && cd ci
cp ../api.mjs .
cat > schema-watch.config.json <<'JSON'
{
  "target": "http://localhost:3001",
  "proxyPort": 4580,
  "apiPort": 4581,
  "dbPath": "./schema-watch.db",
  "frontendSrcDir": "web/src",
  "sync": { "enabled": false }
}
JSON
cp ../.schema-watch -r .
mkdir -p web/src && cp ../web/src/user.js web/src/
cat > contract-smoke.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
BASE="${API_BASE_URL:-http://localhost:4560}"
curl -fsS "$BASE/api/users/42" > /dev/null
SH

# The guide's steps, in its order: backend, proxy, wait-on, smoke, export, check.
V2=1 node api.mjs > api.log 2>&1 & PIDS+=("$!")
$SW start > schema-watch.log 2>&1 & PIDS+=("$!")
if npx --yes wait-on --timeout 60000 http-get://localhost:4580/api/users/1 > /dev/null 2>&1; then
  pass "wait-on sees backend and proxy"
else
  fail "wait-on sees backend and proxy"
fi
API_BASE_URL=http://localhost:4580 bash contract-smoke.sh && pass "smoke script runs through the proxy" || fail "smoke script runs through the proxy"
$SW export --out contract.json > /dev/null 2>&1
out="$($SW check --contract contract.json --baseline .schema-watch/baseline.json --frontend-src web/src --sarif schema-watch.sarif 2>&1)"; code=$?
expect_exit "guide check fails the job" "$code" 1
expect_contains "guide check lists the affected file" "$out" "affects: web/src/user.js"
if node -e 'const s=JSON.parse(require("fs").readFileSync("schema-watch.sarif","utf8")); process.exit(s.version==="2.1.0" && s.runs[0].results.length>0 ? 0 : 1)'; then
  pass "SARIF 2.1.0 with results is written"
else
  fail "SARIF 2.1.0 with results is written"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "All documented commands behave as published."
else
  echo "$FAILURES documented behaviour(s) drifted. Update the docs or report a CLI regression."
  exit 1
fi

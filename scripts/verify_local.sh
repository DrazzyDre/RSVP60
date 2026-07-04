#!/usr/bin/env bash
# GatherArc — final local verification.
#
# Brings up the full Docker stack, seeds demo data, and checks every critical
# surface end to end so you can confirm a clean machine is ready to build on.
#
#   bash scripts/verify_local.sh
#
# Requires: Docker (with the compose plugin) and curl.
# Documented local ports:  backend 8010 · frontend 3005 · postgres 5432
#
# The stack is left running on success so you can click around; tear it down
# with `docker compose down` (or `docker compose down -v` to wipe the DB).

set -uo pipefail

BACKEND="http://localhost:8010"
FRONTEND="http://localhost:3005"
DEMO_TOKEN="fam-demo-token-000000000001"   # seeded "Family" invite tree
COMPOSE="docker compose"

FAILED=0
pass() { printf "  \033[32mPASS\033[0m  %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; FAILED=1; }

echo "==> 1/8  Build and start the stack (db + backend + frontend)"
$COMPOSE up --build -d || { echo "docker compose up failed"; exit 1; }

echo "==> 2/8  Wait for the backend to become healthy ($BACKEND/health)"
for _ in $(seq 1 60); do
  curl -sf "$BACKEND/health" >/dev/null 2>&1 && break
  sleep 2
done
if curl -sf "$BACKEND/health" >/dev/null 2>&1; then pass "backend health"; else fail "backend health (timed out)"; fi

echo "==> 3/8  Seed demo data (inside backend container)"
if $COMPOSE exec -T backend python -m app.seed >/dev/null; then pass "seed"; else fail "seed"; fi

echo "==> 4/8  Backend health payload"
curl -s "$BACKEND/health"; echo

echo "==> 5/8  Public invite token resolves (no tree-name leak enforced by smoke tests)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/api/invites/$DEMO_TOKEN")
if [ "$CODE" = "200" ]; then pass "public invite token resolves ($CODE)"; else fail "public invite token ($CODE)"; fi

echo "==> 6/8  Frontend responds ($FRONTEND)"
for _ in $(seq 1 30); do
  curl -sf "$FRONTEND" >/dev/null 2>&1 && break
  sleep 2
done
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND")
if [ "$CODE" = "200" ]; then pass "frontend home ($CODE)"; else fail "frontend home ($CODE)"; fi

echo "==> 7/8  Admin login"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gatherarc.com","password":"admin123"}')
if [ "$CODE" = "200" ]; then pass "admin login ($CODE)"; else fail "admin login ($CODE)"; fi

echo "==> 8/8  Backend smoke tests against Postgres"
if $COMPOSE exec -T backend python -m tests.smoke_test; then pass "smoke tests"; else fail "smoke tests"; fi

echo
if [ "$FAILED" = "0" ]; then
  echo "All checks passed. The stack is still running:"
else
  echo "Some checks FAILED. Inspect logs with:  $COMPOSE logs"
fi
echo "  Backend : $BACKEND   (health: $BACKEND/health)"
echo "  Frontend: $FRONTEND"
echo "  Tear down:  $COMPOSE down        (keep data)"
echo "              $COMPOSE down -v     (wipe database)"
exit $FAILED

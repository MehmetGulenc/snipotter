#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres (same image as production) and runs supabase/tests/*.sql.
# Usage: supabase/tests/run-local.sh   (needs Docker; never touches the production database)
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=snip-migtest
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=localtest supabase/postgres:15.8.1.085 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2
psql_as() { docker exec -i -e PGPASSWORD=localtest "$NAME" psql -v ON_ERROR_STOP=1 -q -U "$1" -d postgres; }
# The bare image lacks columns that the Storage service adds in production.
echo "alter table storage.buckets add column if not exists public boolean default false,
  add column if not exists file_size_limit bigint, add column if not exists allowed_mime_types text[];" | psql_as supabase_admin
for f in supabase/migrations/0*.sql; do
  role=postgres
  head -1 "$f" | grep -q 'run-as: supabase_admin' && role=supabase_admin
  psql_as "$role" < "$f" >/dev/null || { echo "FAILED: $f (as $role)"; exit 1; }
done
echo "migrations: ok"
for t in supabase/tests/*.sql; do
  out=$(psql_as postgres < "$t" 2>&1) || { echo "$out" | grep -E "ERROR|FAIL"; echo "FAILED: $t"; exit 1; }
  echo "$t: $(echo "$out" | grep -c 'NOTICE:  ok:') checks ok"
done

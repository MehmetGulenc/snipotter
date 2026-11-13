#!/usr/bin/env bash
# End-to-end encryption against real PostgREST (same versions as production), all local.
# Usage: supabase/tests/integration/run.sh   (needs Docker; never touches production)
set -euo pipefail
cd "$(dirname "$0")/../../.."
NET=snip-e2e-net DB=snip-e2e-db API=snip-e2e-rest SECRET=local-test-jwt-secret-at-least-32-characters
cleanup() { docker rm -f "$API" "$DB" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
cleanup; trap cleanup EXIT
docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD=localtest supabase/postgres:15.8.1.085 >/dev/null
until docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
psql_as() { docker exec -i -e PGPASSWORD=localtest "$DB" psql -v ON_ERROR_STOP=1 -q -U "$1" -d postgres; }
echo "alter table storage.buckets add column if not exists public boolean default false,
  add column if not exists file_size_limit bigint, add column if not exists allowed_mime_types text[];
  alter role authenticator with login password 'localtest';" | psql_as supabase_admin
psql_as supabase_admin < supabase/tests/integration/auth_uid.sql
for f in supabase/migrations/0*.sql; do
  role=postgres; head -1 "$f" | grep -q 'run-as: supabase_admin' && role=supabase_admin
  psql_as "$role" < "$f" >/dev/null
done
docker run -d --name "$API" --network "$NET" -p 127.0.0.1:54321:3000 \
  -e PGRST_DB_URI="postgres://authenticator:localtest@$DB:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" postgrest/postgrest:v14.8 >/dev/null
until curl -s -o /dev/null http://127.0.0.1:54321/; do sleep 1; done
DB_CONTAINER="$DB" JWT_SECRET="$SECRET" node --test --test-force-exit supabase/tests/integration/e2e.test.cjs

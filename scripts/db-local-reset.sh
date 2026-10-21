#!/usr/bin/env bash
# يعيد إنشاء قاعدة اختبار محلية ويطبّق الـ migrations عليها (يتطلب PostgreSQL محليًا).
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
PGURL_ADMIN="${PGURL_ADMIN:-postgresql://postgres@localhost:54329/postgres}"
DB="${MH_TEST_DB:-mihwar_test}"
cd "$(dirname "$0")/.."
psql "$PGURL_ADMIN" -q -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB"
URL="${PGURL_ADMIN%/*}/$DB"
psql "$URL" -q -v ON_ERROR_STOP=1 -f tests/db/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
# إعادة التنفيذ للتأكد من أن الملفات قابلة لإعادة التشغيل
for f in supabase/migrations/*.sql; do
  psql "$URL" -q -v ON_ERROR_STOP=1 -f "$f"
done
echo "OK: $URL"

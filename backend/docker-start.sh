#!/bin/sh
# Container entrypoint (see the CMD comment in Dockerfile for why each step is
# here). Kept in its own file because a Dockerfile CMD cannot span lines
# without a backslash on every line.
set -e
php artisan config:clear

# The live Supabase schema is maintained by hand and its `migrations` table
# does not reflect it, so running every pending migration on boot crash-loops
# the container (duplicate columns) and could reach destructive ones. Migrate
# and seed only when explicitly asked for with RUN_MIGRATIONS=true.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  php artisan migrate --force
  php artisan db:seed --force
fi

php artisan config:cache
php artisan route:cache
php artisan event:cache

php artisan serve --host=0.0.0.0 --port=${PORT:-10000} &
server=$!
# REQ-AN-03 watchdog: without a running scheduler the heartbeat file is
# never written and GET /api/health/scheduler answers 503 forever, even
# though the app itself is healthy.
php artisan schedule:work >/dev/null 2>&1 &
sleep 2
i=0
while [ $i -lt "${PHP_CLI_SERVER_WORKERS:-8}" ]; do
  curl -s -o /dev/null "http://127.0.0.1:${PORT:-10000}/api/products/filter" &
  i=$((i + 1))
done
wait $server

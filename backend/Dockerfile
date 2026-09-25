FROM php:8.2-cli

# Install system dependencies & PostgreSQL dev libraries
RUN apt-get update && apt-get install -y \
    libpq-dev \
    libzip-dev \
    zip \
    unzip \
    git \
    curl \
    && docker-php-ext-install pdo pdo_pgsql pgsql \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Opcache: without it every request re-parses the whole framework, which alone
# can push a Supabase-backed login past the 1-second frontend budget.
RUN docker-php-ext-enable opcache

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Copy application source
COPY . .

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Set permissions for Laravel
RUN chmod -R 777 storage bootstrap/cache

# php -S is single-threaded by default: one slow Supabase round trip stalls
# every other request. A worker pool keeps each request inside its 1s budget.
ENV PHP_CLI_SERVER_WORKERS=8
# Do NOT set PHP_INI_SCAN_DIR: any value for it (an empty string included)
# overrides the compiled-in scan directory, so conf.d/ would be skipped and
# neither docker-php-ext-opcache.ini nor the settings below would ever load.
RUN printf 'opcache.enable_cli=1\nopcache.enable=1\nopcache.memory_consumption=192\nopcache.max_accelerated_files=20000\nopcache.validate_timestamps=0\nrealpath_cache_size=4096K\nrealpath_cache_ttl=600\n' > /usr/local/etc/php/conf.d/opcache.ini

EXPOSE 10000

# Cached config/routes/events remove the per-request framework rebuild, which on
# this Supabase link is the difference between landing inside and outside the
# 1-second frontend budget. `config:clear` first so a stale image cache can
# never win over the current .env.
#
# After the server binds, one cheap request per worker is fired at it: with
# DB_PERSISTENT each `php -S` worker then holds a keep-alive handle to the
# Tokyo pooler, so the ~0.8 s TLS handshake is paid once at boot instead of on
# the first real user request.
CMD sh -c '
  set -e
  php artisan config:clear
  php artisan migrate --force
  php artisan db:seed --force
  php artisan config:cache
  php artisan route:cache
  php artisan event:cache

  php artisan serve --host=0.0.0.0 --port=${PORT:-10000} &
  server=$!
  sleep 2
  i=0
  while [ $i -lt "${PHP_CLI_SERVER_WORKERS:-8}" ]; do
    curl -s -o /dev/null "http://127.0.0.1:${PORT:-10000}/api/products/filter" &
    i=$((i + 1))
  done
  wait $server
'

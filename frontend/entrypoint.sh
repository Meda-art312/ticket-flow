#!/bin/sh
set -eu
: "${BACKEND_UPSTREAM:=http://api:3000}"
printf '%s\n' "$BACKEND_UPSTREAM" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' || { echo 'BACKEND_UPSTREAM must be an HTTP(S) origin without a path' >&2; exit 1; }
# Only substitute the server setting, preserving Nginx variables.
export BACKEND_UPSTREAM
envsubst '${BACKEND_UPSTREAM}' < /app/nginx.template.conf > /tmp/ticketflow-server.conf
exec nginx -g 'daemon off;'

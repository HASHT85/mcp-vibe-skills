#!/bin/sh

# Ensure variables are set
if [ -z "$DASHBOARD_USER" ] || [ -z "$DASHBOARD_PASS" ]; then
    echo "ERROR: DASHBOARD_USER and DASHBOARD_PASS must be set."
    exit 1
fi

echo "Generating .htpasswd for user: $DASHBOARD_USER"
htpasswd -cb /etc/nginx/.htpasswd "$DASHBOARD_USER" "$DASHBOARD_PASS"

echo "Starting nginx..."
# Run the original command (nginx -g 'daemon off;')
exec "$@"

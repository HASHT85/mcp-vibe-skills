#!/bin/sh

echo "Starting nginx (auth handled by React login page)..."
# Run the original command (nginx -g 'daemon off;')
exec "$@"

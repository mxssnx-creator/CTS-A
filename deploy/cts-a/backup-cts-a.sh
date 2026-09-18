#!/usr/bin/env bash
# Regular CTS-A backups: config, source, state, logs.
set -euo pipefail
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${CTS_A_BACKUP_DIR:-/var/backups/cts-a}"
KEEP_DAYS="${CTS_A_BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DEST" /var/lib/cts-a /var/log/cts-a
TAR="$DEST/cts-a-$STAMP.tar.gz"
tar -czf "$TAR" \
  --exclude='node_modules' \
  --exclude='*.log' \
  --exclude='screenshots' \
  --exclude='artifacts' \
  --exclude='attachments' \
  -C / \
  etc/cts-a \
  opt/cts-a/deploy \
  opt/cts-a/src \
  opt/cts-a/package.json \
  opt/cts-a/package-lock.json \
  opt/cts-a/vite.config.ts \
  var/lib/cts-a \
  var/log/cts-a \
  2>/dev/null || tar -czf "$TAR" -C / etc/cts-a opt/cts-a/deploy 2>/dev/null || true
ln -sfn "$(basename "$TAR")" "$DEST/cts-a-latest.tar.gz"
find "$DEST" -name 'cts-a-*.tar.gz' -mtime "+$KEEP_DAYS" -delete
echo "backup $TAR"

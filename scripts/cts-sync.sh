#!/usr/bin/env bash
# Pull remote server into this workspace first, then push/merge.
# Usage: scripts/cts-sync.sh [pull|push]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HOST="152.53.114.112"
KEY="${CTS_SSH_KEY:-/root/.ssh/id_cts_a}"
if [[ ! -r "$KEY" && -r /tmp/cts-ssh/id_kex ]]; then KEY=/tmp/cts-ssh/id_kex; fi
export GIT_SSH_COMMAND="ssh -i ${KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "root@${HOST}")
MODE="${1:-push}"

echo "== server → origin =="
"${SSH[@]}" 'cd /opt/cts-a && git fetch origin && git status -sb && git rev-parse --short HEAD
if [[ -n "$(git status --porcelain)" ]]; then echo "WARN server working tree dirty"; fi
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [[ "${ahead:-0}" -gt 0 ]]; then git push origin main; fi'

echo "== origin → workspace =="
git fetch origin
behind=$(git rev-list --count HEAD..origin/main || echo 0)
ahead=$(git rev-list --count origin/main..HEAD || echo 0)
echo "workspace $(git rev-parse --short HEAD)  origin $(git rev-parse --short origin/main)  behind $behind ahead $ahead"
if [[ "$behind" -gt 0 ]]; then
  git merge --ff-only origin/main
fi
if [[ "$MODE" == "pull" ]]; then
  echo "pull only · $(git rev-parse --short HEAD)"
  exit 0
fi
if [[ "$ahead" -gt 0 || "$behind" -gt 0 ]]; then
  git push origin main
fi

echo "== workspace → server → github =="
"${SSH[@]}" 'cd /opt/cts-a && git fetch origin && git merge --ff-only origin/main && git push github main && echo "server $(git rev-parse --short HEAD) github $(git rev-parse --short github/main)"'
echo "synced $(git rev-parse --short HEAD)"

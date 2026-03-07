#!/bin/zsh
set -e
cd "$(dirname "$0")"
echo "Starting StayHia (scaffold mode)..."
mkdir -p .run
if [ ! -f .run/status.txt ]; then
  echo "initialized" > .run/status.txt
fi
echo "running" > .run/status.txt
echo "StayHia status: running"
open "./README.md"

#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [ -f .run/status.txt ]; then
  echo "StayHia status: $(cat .run/status.txt)"
else
  echo "StayHia status: not initialized"
fi

#!/bin/zsh
set -e
cd "$(dirname "$0")"
mkdir -p .run
echo "stopped" > .run/status.txt
echo "StayHia status: stopped"

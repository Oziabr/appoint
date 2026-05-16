#!/usr/bin/env bash
set -e

echo "building appoint..."
mkdir -p dist
pug src/index.pug --out dist --pretty
cp dist/index.pug.html dist/index.html 2>/dev/null || true
# pug outputs as index.html when input is index.pug
echo "built → dist/index.html ($(wc -l < dist/index.html) lines)"

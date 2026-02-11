#!/usr/bin/env bash

set -e

cd "$(dirname "$0")"

echo "Building WASM..."
wasm-pack build --target web --release

echo "Copying to src/wasm..."
mkdir -p ../src/wasm
cp pkg/wasm_markdown.js ../src/wasm/
cp pkg/wasm_markdown_bg.wasm ../src/wasm/
cp pkg/wasm_markdown.d.ts ../src/wasm/

echo "Done! WASM files copied to src/wasm/"

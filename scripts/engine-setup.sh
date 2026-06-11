#!/usr/bin/env bash
# Rebuild the vendored wasm engine from source.
#
# Requires a Rust toolchain (https://rustup.rs) and wasm-pack
# (`brew install wasm-pack` or `cargo install wasm-pack`). The app itself
# never needs these: both build outputs are checked in, so `bun run build`
# works on any machine and in CI without Rust. Run this only to pick up a
# new engine version, then commit the refreshed engine/ and public/engine/.
set -euo pipefail

cd "$(dirname "$0")/.."

REPO="${AXIOM_RULES_ENGINE_REPO:-https://github.com/TheAxiomFoundation/axiom-rules-engine.git}"
REF="${AXIOM_RULES_ENGINE_REF:-main}"
WORK=.engine-src

command -v wasm-pack >/dev/null || {
  echo "wasm-pack not found — install it with: brew install wasm-pack (or cargo install wasm-pack)" >&2
  exit 1
}

echo "Cloning ${REPO}@${REF} (depth 1)…"
rm -rf "$WORK"
git clone --depth 1 --branch "$REF" "$REPO" "$WORK"

echo "Building wasm (web + nodejs targets)…"
(cd "$WORK" && wasm-pack build wasm --target web --out-dir pkg-web)
(cd "$WORK" && wasm-pack build wasm --target nodejs --out-dir pkg-node)

echo "Vendoring outputs…"
rm -rf public/engine engine/pkg-node
mkdir -p public/engine engine/pkg-node
FILES=(
  axiom_rules_engine_wasm.js
  axiom_rules_engine_wasm_bg.wasm
  axiom_rules_engine_wasm.d.ts
  axiom_rules_engine_wasm_bg.wasm.d.ts
  package.json
  LICENSE
  README.md
)
for f in "${FILES[@]}"; do
  cp "$WORK/wasm/pkg-web/$f" public/engine/
  cp "$WORK/wasm/pkg-node/$f" engine/pkg-node/
done
# wasm-pack drops a `.gitignore` containing `*` into pkg dirs; the whole
# point here is to check the outputs in, so it is deliberately not copied.

COMMIT=$(git -C "$WORK" rev-parse HEAD)
cat > engine/UPSTREAM.json <<EOF
{
  "repo": "${REPO%.git}",
  "ref": "$REF",
  "commit": "$COMMIT",
  "wasm_pack": "$(wasm-pack --version | awk '{print $2}')",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

rm -rf "$WORK"
echo "Done: vendored axiom-rules-engine@${COMMIT:0:7} into public/engine (web) and engine/pkg-node (nodejs)."

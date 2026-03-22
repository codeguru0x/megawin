#!/usr/bin/env bash
# Generate .asl.json for every *.ts step-function definition in this directory.
# Usage: ./generate-asl.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SUCCESS=0
FAIL=0

for ts_file in "$DIR"/*.ts; do
  stem="$(basename "$ts_file" .ts)"
  out_file="$DIR/${stem}.asl.json"

  export_name=$(grep -m1 "^export const" "$ts_file" | sed 's/export const \([A-Z_]*\).*/\1/')

  if [ -z "$export_name" ]; then
    echo "✗ SKIP ${stem}.ts — no top-level 'export const' found"
    FAIL=$((FAIL + 1))
    continue
  fi

  echo "→ ${stem}.ts  (${export_name})"
  if (cd "$DIR" && npx tsx -e \
    "import { ${export_name} } from './${stem}'; console.log(JSON.stringify(${export_name}, null, 2))" \
    > "$out_file" 2>/tmp/asl_gen_err); then
    echo "  ✓ ${stem}.asl.json"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "  ✗ FAILED"
    cat /tmp/asl_gen_err >&2
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Done: $SUCCESS succeeded, $FAIL failed"

[ "$FAIL" -eq 0 ]

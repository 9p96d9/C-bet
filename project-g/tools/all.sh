#!/bin/sh
# 作り直して、全部の検査を回す。
# コードを直したら、これを 1 本流せばよい。落ちたところで止まる。
set -e
cd "$(dirname "$0")/.."

echo "=== 作り直す ==="
node tools/analyze-src.mjs > /dev/null
node tools/gen-headers.mjs
node tools/build-html.mjs
node tools/build-spec.mjs

echo
echo "=== 検査 ==="
for t in acceptance holiday-test diag-test robustness-test dev-check assemble-check ui-check docs-check; do
  printf '%-18s ' "$t"
  if node "tools/$t.mjs" > "out/$t.tail" 2>&1; then
    tail -1 "out/$t.tail"
  else
    echo "FAILED"; cat "out/$t.tail"; exit 1
  fi
  rm -f "out/$t.tail"
done

for t in "compare-pdf.py --manual" "verify-xlsx-independent.py"; do
  printf '%-18s ' "$(echo "$t" | cut -d' ' -f1)"
  # shellcheck disable=SC2086
  if python3 tools/$t > out/py.tail 2>&1; then
    tail -1 out/py.tail
  else
    echo "FAILED"; cat out/py.tail; exit 1
  fi
  rm -f out/py.tail
done

echo
echo "=== ヘッダーと仕様書が最新か ==="
node tools/gen-headers.mjs --check > /dev/null && echo "ヘッダーは最新"
echo
echo "全部通りました"

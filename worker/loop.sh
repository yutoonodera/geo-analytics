#!/bin/sh

TARGET="${WORKER_TARGET:-http://nuxt:3000/api/jobs/process-one}"
TOKEN="${WORKER_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "[worker] WORKER_TOKEN is missing"
  exit 1
fi

echo "[worker] target=$TARGET"
echo "[worker] waiting for nuxt..."

# Nuxtが起動するまで待つ（失敗しても落ちない）
until curl -sS --max-time 2 "http://nuxt:3000/" >/dev/null 2>&1; do
  echo "[worker] nuxt not ready yet..."
  sleep 1
done

echo "[worker] nuxt is ready"

IDLE_SLEEP="${IDLE_SLEEP:-3}"

# ★ここが本体：無限ループ
while true; do
  RES="$(curl -sS -X POST "$TARGET" \
    -H "x-worker-token: $TOKEN" \
    -H "content-type: application/json" \
    --max-time 30 2>/dev/null || echo '{"ok":false,"processed":0,"error":"curl_failed"}')"

  echo "[worker] $(date -Iseconds) $RES"

  # processed:0 なら少し長めに待つ（キュー空のとき）
  echo "$RES" | grep -q '"processed"[[:space:]]*:[[:space:]]*0' && sleep "$IDLE_SLEEP"

  # Nominatim対策：最低1秒以上空ける
  sleep 1
done

#!/usr/bin/env bash
#
# Snipotter admin — bir-tıkla worker secret kurulumu.
#
# Bu script, ~/.snipotter-admin.env'den secret'ları okuyup hem cron
# hem de heartbeat Cloudflare Worker'larına aktarır. wrangler secret
# put komutları interaktif olduğu için biz değerleri stdin üzerinden
# besliyoruz — terminal geçmişine, log dosyalarına veya repo'ya hiçbir
# şey sızmaz.
#
# Kullanım:
#   1. cp scripts/setup-admin-secrets.example.env ~/.snipotter-admin.env
#   2. ~/.snipotter-admin.env dosyasını editör'le aç ve değerleri doldur
#   3. ./scripts/setup-admin-secrets.sh
#
# Çalıştırma sonunda script:
#   • Secret'ları her iki worker'a da set'ler
#   • Cron worker'ın /run endpoint'ini tetikleyip ilk pull'u yapar
#   • Admin panelinin Supabase'i okuyabilmesi için RLS migration'ının
#     uygulandığını hatırlatır

set -euo pipefail

ENV_FILE="${SNIPOTTER_ADMIN_ENV:-$HOME/.snipotter-admin.env}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ENV_FILE" ]]; then
  cat <<EOF
✗ $ENV_FILE bulunamadı.

Önce şunu yap:
  cp scripts/setup-admin-secrets.example.env ~/.snipotter-admin.env
  \$EDITOR ~/.snipotter-admin.env   # değerleri doldur

Dosya .env formatında (KEY=VALUE, satır başı '#' yorum). Service-role
key gibi alanlar zorunlu, diğerleri opsiyonel — boş bırakırsan o kaynak
sessizce atlanır.
EOF
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

cd "$REPO_ROOT"

# Wrangler komutlarının npx üzerinden hep aynı pinli sürümü kullanması için
WRANGLER="npx --yes wrangler@4.40.3"

put_secret() {
  local worker_dir="$1"
  local name="$2"
  local value="${3:-}"
  if [[ -z "$value" ]]; then
    echo "  − $name boş, atlanıyor"
    return 0
  fi
  pushd "$worker_dir" >/dev/null
  printf '%s' "$value" | $WRANGLER secret put "$name" >/dev/null 2>&1 \
    && echo "  ✓ $name" \
    || echo "  ✗ $name (wrangler secret put başarısız)"
  popd >/dev/null
}

echo ""
echo "▸ Cron worker secret'ları (workers/cron)"
put_secret workers/cron "SUPABASE_URL"             "${SUPABASE_URL:-}"
put_secret workers/cron "SUPABASE_SERVICE_KEY"     "${SUPABASE_SERVICE_KEY:-}"
put_secret workers/cron "CRON_TRIGGER_SECRET"      "${CRON_TRIGGER_SECRET:-}"
put_secret workers/cron "GITHUB_TOKEN"             "${GITHUB_TOKEN:-}"
put_secret workers/cron "MS_TENANT_ID"             "${MS_TENANT_ID:-}"
put_secret workers/cron "MS_CLIENT_ID"             "${MS_CLIENT_ID:-}"
put_secret workers/cron "MS_CLIENT_SECRET"         "${MS_CLIENT_SECRET:-}"
put_secret workers/cron "PLAY_SERVICE_ACCOUNT_JSON_B64" "${PLAY_SERVICE_ACCOUNT_JSON_B64:-}"
put_secret workers/cron "CLOUDFLARE_ACCOUNT_ID"    "${CLOUDFLARE_ACCOUNT_ID:-}"
put_secret workers/cron "CLOUDFLARE_API_TOKEN"     "${CLOUDFLARE_API_TOKEN:-}"

echo ""
echo "▸ Heartbeat worker secret'ları (workers/heartbeat)"
put_secret workers/heartbeat "SUPABASE_URL"        "${SUPABASE_URL:-}"
put_secret workers/heartbeat "SUPABASE_SERVICE_KEY" "${SUPABASE_SERVICE_KEY:-}"

echo ""
echo "▸ İlk cron pull'u tetikleniyor (GitHub Releases — anında doluyor)"
if [[ -n "${CRON_TRIGGER_SECRET:-}" ]]; then
  CRON_HOST="${CRON_HOST:-https://snipotter-cron.mehmetgulenc915.workers.dev}"
  RESP=$(curl -s "${CRON_HOST}/run?source=github&secret=${CRON_TRIGGER_SECRET}" || echo "")
  if [[ -n "$RESP" ]]; then
    echo "  ✓ ${RESP:0:200}…"
  else
    echo "  ✗ İlk pull yanıt vermedi (worker yeniden deploy gerekebilir)"
  fi
else
  echo "  − CRON_TRIGGER_SECRET boş, manuel tetikleme atlanıyor"
fi

echo ""
echo "▸ Bitti. Sonra:"
echo "    1. Supabase'de 0007_admin_rls_policies.sql'i çalıştır (admin reads için RLS fix)"
echo "    2. https://snipotter-admin.mehmetgulenc915.workers.dev/login/ — magic link al"
echo "    3. Dashboard'da GitHub indirme sayıları görünmeli"

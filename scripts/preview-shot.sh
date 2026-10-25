#!/usr/bin/env bash
# Снимок изображения устройства со страницы предпросмотра.
#
# Использование: scripts/preview-shot.sh <сессия> <порт> <файл.png> <параметры адреса>
# Пример: scripts/preview-shot.sh qc 5201 .work/qc/tuner.png 'device=qc&midi=B1 2D 7F&width=1100'
#
# Требует запущенного сервера разработки на порту (npx vite --port <порт>).
# Сессия браузера playwright-cli открывается при первом вызове и остаётся
# открытой; закрыть: playwright-cli -s=<сессия> close.
set -euo pipefail
session=$1
port=$2
out=$(realpath -m "$3")
query=${4// /%20}
query=${query//+/%2B}
url="http://127.0.0.1:${port}/preview.html?${query}"
mkdir -p "$(dirname "$out")"
if ! playwright-cli -s="$session" goto "$url" >/dev/null 2>&1; then
  playwright-cli -s="$session" open "$url" >/dev/null
fi
playwright-cli -s="$session" resize 1400 1200 >/dev/null
sleep 0.7
playwright-cli -s="$session" screenshot '[data-testid=device-body]' --filename="$out" >/dev/null
echo "$out"

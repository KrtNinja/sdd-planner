#!/usr/bin/env bash
# Обновляет встроенные копии сторонних скиллов: grilling (mattpocock/skills) и humanizer (blader/humanizer).
# Запуск из корня репозитория: scripts/update-vendor.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

vendor() { # repo  путь-внутри-repo  папка-скилла
  local repo="$1" src="$2" dst="$root/skills/$3"
  git clone -q --depth 1 "https://github.com/$repo" "$tmp/$3"
  local rev; rev="$(git -C "$tmp/$3" rev-parse --short HEAD)"
  mkdir -p "$dst"
  cp "$tmp/$3/$src/SKILL.md" "$dst/SKILL.md"
  cp "$tmp/$3/LICENSE" "$dst/LICENSE"
  local url="https://github.com/$repo/tree/$rev"
  [ "$src" != "." ] && url="$url/$src"
  printf 'Источник: %s (MIT, см. LICENSE).\nОбновление: scripts/update-vendor.sh\n' "$url" > "$dst/UPSTREAM.md"
  echo "$3 ← $repo@$rev"
}

vendor mattpocock/skills skills/productivity/grilling grilling
vendor blader/humanizer . humanizer

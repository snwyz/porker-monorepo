#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

targets=(
  .pnpm-store
  packages/contracts/cache
  packages/contracts/out
  packages/contracts/broadcast
  dist
)

while IFS= read -r -d '' directory; do
  targets+=("$directory")
done < <(find . -type d -name '.next' -print0)

while IFS= read -r -d '' directory; do
  targets+=("$directory")
done < <(find . -type d -name '.turbo' -print0)

while IFS= read -r -d '' directory; do
  targets+=("$directory")
done < <(find . -maxdepth 1 -type d -name '.next-*' -print0)

while IFS= read -r -d '' directory; do
  targets+=("$directory")
done < <(find . -type d -name 'node_modules' -print0)

existing_targets=()
for target in "${targets[@]}"; do
  if [[ -e "$target" ]]; then
    existing_targets+=("$target")
  fi
done

if (( ${#existing_targets[@]} == 0 )); then
  echo "没有找到可清理的目录。"
  exit 0
fi

printf '将删除以下目录：\n'
printf '  %s\n' "${existing_targets[@]}"

if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "确认删除？[y/N] " confirmation
  if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
    echo "已取消。"
    exit 0
  fi
fi

rm -rf -- "${existing_targets[@]}"
echo "清理完成。"

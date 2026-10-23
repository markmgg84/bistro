#!/usr/bin/env bash
set -euo pipefail
cd /workspace/bistro
export npm_config_cache=/workspace/.npm-cache
if [ ! -x /workspace/postgres/usr/lib/postgresql/17/bin/postgres ]; then
  mkdir -p /workspace/apt/state/lists/partial /workspace/apt/cache/archives/partial /workspace/pg-packages
  cat > /workspace/apt/sources.list <<'SOURCES'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://security.debian.org/debian-security trixie-security main
SOURCES
  apt_args=(-o Dir::Etc::sourcelist=/workspace/apt/sources.list -o Dir::Etc::sourceparts=- -o Dir::State=/workspace/apt/state -o Dir::Cache=/workspace/apt/cache)
  /usr/bin/apt-get "${apt_args[@]}" update
  (cd /workspace/pg-packages && /usr/bin/apt-get "${apt_args[@]}" download postgresql-17 postgresql-client-17)
  mkdir -p /workspace/postgres
  for package in /workspace/pg-packages/*.deb; do dpkg-deb -x "$package" /workspace/postgres; done
fi
npm ci
npm run setup:local
npm test
npm run test:integration
npm run build

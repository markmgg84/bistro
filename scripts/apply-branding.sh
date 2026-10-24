#!/bin/bash
# Apply only the reviewed front-end files to an existing local installation.
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$HOME/Downloads/bistro-modern-business}"
if [ ! -f "$TARGET/package.json" ]; then
  echo "Cartella progetto non trovata: $TARGET" >&2
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"
if [ "$SOURCE" = "$TARGET" ]; then
  echo "Questa cartella contiene già la nuova grafica. Avvia npm run dev."
  exit 0
fi
FILES=(app/layout.tsx app/workspace.tsx app/login/form.tsx app/brand.tsx app/branding.css app/modern-business.css public/brand/maina.png public/brand/bistro.png public/brand/marina.png public/icon.svg public/icon-192.png public/icon-512.png public/manifest.webmanifest public/offline.html public/sw.js)
for file in "${FILES[@]}"; do
  if [ ! -f "$SOURCE/$file" ]; then
    echo "Archivio incompleto: manca $file. Nessuna modifica applicata." >&2
    exit 1
  fi
done
mkdir -p "$TARGET/.local/branding-backups"
BACKUP="$(mktemp -d "$TARGET/.local/branding-backups/maina.XXXXXX")"
for file in "${FILES[@]}"; do
  if [ -f "$TARGET/$file" ]; then
    mkdir -p "$BACKUP/$(dirname "$file")"
    cp "$TARGET/$file" "$BACKUP/$file"
  fi
  mkdir -p "$TARGET/$(dirname "$file")"
  cp "$SOURCE/$file" "$TARGET/$file"
done
echo "Grafica Il pub della Maina applicata."
echo "Copia della grafica precedente: $BACKUP"
echo "Account, database, .env e funzionalità non sono stati modificati."
echo "Nel Terminale dell'app premi Ctrl+C e riavvia con npm run dev."
echo "Apri http://localhost:3000 e premi Comando+Maiusc+R."

#!/bin/bash
# Add the category-report module to the existing local installation.
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$HOME/Downloads/bistro-modern-business}"
if [ ! -f "$TARGET/package.json" ] || [ ! -f "$TARGET/.env" ]; then
  echo "Cartella del progetto già configurato non trovata: $TARGET" >&2
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"
if [ "$SOURCE" = "$TARGET" ]; then
  echo "Usa lo script dall’archivio scaricato, indicando la cartella dell’app già configurata." >&2
  exit 1
fi
FILES=(app/workspace.tsx app/wycash-categories.tsx lib/wycash.ts lib/server/api.ts prisma/schema.prisma prisma/migrations/202610240001_category_reports/migration.sql)
for file in "${FILES[@]}"; do
  if [ ! -f "$SOURCE/$file" ]; then
    echo "Archivio incompleto: manca $file. Nessun aggiornamento applicato." >&2
    exit 1
  fi
done
cd "$TARGET"
node --env-file-if-exists=.env -e 'if(!process.env.MIGRATION_DATABASE_URL) { console.error("Manca MIGRATION_DATABASE_URL: configurare la connessione del proprietario del database prima di aggiornare. Non condividere password in chat."); process.exit(1); }'
mkdir -p .local/wycash-backups
BACKUP="$(mktemp -d "$TARGET/.local/wycash-backups/categories.XXXXXX")"
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    mkdir -p "$BACKUP/$(dirname "$file")"
    cp "$file" "$BACKUP/$file"
  fi
done
# Database changes are additive. Do not reset, seed or replace local configuration.
mkdir -p prisma/migrations/202610240001_category_reports
cp "$SOURCE/prisma/schema.prisma" prisma/schema.prisma
cp "$SOURCE/prisma/migrations/202610240001_category_reports/migration.sql" prisma/migrations/202610240001_category_reports/migration.sql
if ! npm run db:deploy; then
  echo "Migrazione non riuscita. Il modulo grafico non è stato sostituito. Copia dei file precedenti: $BACKUP" >&2
  exit 1
fi
npm run db:generate
for file in app/workspace.tsx app/wycash-categories.tsx lib/wycash.ts lib/server/api.ts; do
  mkdir -p "$(dirname "$file")"
  cp "$SOURCE/$file" "$file"
done
echo "Modulo Wycash categorie aggiornato. Copia precedente: $BACKUP"
echo "Configurazione, account, scontrini, turni e loghi preservati."
echo "Avvia npm run dev nella cartella dell’app, poi apri http://localhost:3000."

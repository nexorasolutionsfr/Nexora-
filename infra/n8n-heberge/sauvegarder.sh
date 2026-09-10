#!/usr/bin/env bash
# Sauvegarde à chaud : base Postgres + clé de chiffrement + dossier n8n. À lancer par cron chaque nuit.
# N'utilise que les conteneurs déjà en place (aucune image supplémentaire à télécharger).
set -euo pipefail
cd "$(dirname "$0")"
HORODATAGE=$(date +%Y-%m-%d_%H%M)
DEST=${SAUVEGARDES_DIR:-./sauvegardes}/$HORODATAGE
mkdir -p "$DEST"
docker compose exec -T postgres pg_dump -U n8n -d n8n --no-owner | gzip > "$DEST/n8n.sql.gz"
cp secrets/n8n_encryption_key "$DEST/n8n_encryption_key"
docker compose exec -T n8n tar czf - -C /home/node/.n8n . > "$DEST/n8n_data.tgz"
chmod -R go-rwx "$DEST"
find "${SAUVEGARDES_DIR:-./sauvegardes}" -maxdepth 1 -mindepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "sauvegarde : $DEST ($(du -sh "$DEST" | cut -f1))"

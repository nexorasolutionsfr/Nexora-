#!/usr/bin/env bash
# Restaure une sauvegarde de sauvegarder.sh dans une pile ARRÊTÉE (ou vide).
# Usage : ./restaurer.sh ./sauvegardes/2026-09-10_0300
set -euo pipefail
cd "$(dirname "$0")"
SRC=${1:?chemin de la sauvegarde}
[ -f "$SRC/n8n.sql.gz" ] && [ -f "$SRC/n8n_encryption_key" ] || { echo "sauvegarde incomplète"; exit 1; }
cmp -s "$SRC/n8n_encryption_key" secrets/n8n_encryption_key || { echo "REFUS : la clé de chiffrement diffère de celle de la pile. Les identifiants seraient illisibles. Remettez d'abord la bonne clé dans secrets/."; exit 1; }
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U n8n -d n8n >/dev/null 2>&1; do sleep 2; done
docker compose exec -T postgres psql -U n8n -d postgres -q -c "DROP DATABASE IF EXISTS n8n;" -c "CREATE DATABASE n8n OWNER n8n;"
gunzip -c "$SRC/n8n.sql.gz" | docker compose exec -T postgres psql -U n8n -d n8n -q
docker compose up -d n8n
until docker compose exec -T n8n test -d /home/node/.n8n >/dev/null 2>&1; do sleep 2; done
if [ -f "$SRC/n8n_data.tgz" ]; then
  docker compose exec -T n8n sh -c 'rm -rf /home/node/.n8n/* && tar xzf - -C /home/node/.n8n' < "$SRC/n8n_data.tgz"
  docker compose restart n8n >/dev/null
fi
docker compose up -d
echo "restauré depuis $SRC — vérifier : identifiants lisibles, workflows présents, AUCUN workflow actif avant contrôle des files"

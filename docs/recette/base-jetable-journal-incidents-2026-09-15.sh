#!/bin/bash
# Éprouve 20260921000100_journal_incidents_n8n.sql sur une base jetable
# construite à partir d'un export FRAIS du schéma de la PRODUCTION (lecture
# seule), puis joue docs/recette/controles-journal-incidents.sql.
#
#   bash docs/recette/base-jetable-journal-incidents-2026-09-15.sh
#
# Code 0 = migration appliquée deux fois sans erreur (rejouable) et tous les
# contrôles OK. Tout le reste = ÉCHEC. Mêmes pièges évités que
# base-jetable-2026-09-14.sh (base `postgres` de l'image, `auth` de l'image,
# droits ramenés à l'état déclaré avant de les mesurer).
# ECHEC_VOLONTAIRE=controle ajoute un contrôle KO pour prouver la barrière.

set -Eeuo pipefail
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:$PATH"

DEPOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRAVAIL="${TRAVAIL:-/tmp/nexora-base-jetable-journal-$(date +%Y%m%d-%H%M%S)}"
CONTENEUR="${CONTENEUR:-nexora-jetable-journal}"
PORT="${PORT:-55434}"
IMAGE=public.ecr.aws/supabase/postgres:17.6.1.166
MIGRATION=20260921000100_journal_incidents_n8n.sql

etape="préparation"
trap 'echo; echo "ÉCHEC — étape : $etape (ligne $LINENO)"; exit 1' ERR
mkdir -p "$TRAVAIL/supabase"
psql_admin() { docker exec "$CONTENEUR" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

etape="1. export du schéma public de Production (lecture seule)"
echo "== $etape =="
if [ "${REUTILISER_EXPORT:-}" = 1 ] && [ -s "$TRAVAIL/prod-schema.sql" ]; then
  echo "   export existant réutilisé (REUTILISER_EXPORT=1)"
else
  ( cd "$TRAVAIL" && supabase link --project-ref omphppsmhmyllapdqevn >/dev/null 2>&1 \
    && supabase db dump --linked -f "$TRAVAIL/prod-schema.sql" >/dev/null 2>&1 )
fi
rm -rf "$TRAVAIL/supabase/migrations"
test -s "$TRAVAIL/prod-schema.sql"
grep -q 'CREATE TABLE IF NOT EXISTS "public"."erreurs_automatisation"' "$TRAVAIL/prod-schema.sql"
echo "   $(wc -l < "$TRAVAIL/prod-schema.sql") lignes ; erreurs_automatisation présente en Production"

etape="2. base jetable"
echo "== $etape =="
docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
docker run -d --name "$CONTENEUR" -e POSTGRES_PASSWORD=jetable -p "127.0.0.1:$PORT:5432" "$IMAGE" >/dev/null
pret=0
for _ in $(seq 1 120); do
  if docker logs "$CONTENEUR" 2>&1 | grep -q 'PostgreSQL init process complete' \
     && docker exec "$CONTENEUR" pg_isready -U postgres >/dev/null 2>&1; then pret=1; break; fi
  sleep 2
done
test "$pret" = 1
sleep 3
psql_admin -qc "drop publication if exists supabase_realtime; create publication supabase_realtime;" >/dev/null
docker cp "$TRAVAIL/prod-schema.sql" "$CONTENEUR:/tmp/prod-schema.sql" >/dev/null
psql_admin -f /tmp/prod-schema.sql > "$TRAVAIL/chargement.txt" 2>&1 || { tail -15 "$TRAVAIL/chargement.txt"; false; }

etape="3. lignes existantes simulées (anciennes erreurs de l'Assistant)"
echo "== $etape =="
psql_admin -qc "insert into public.erreurs_automatisation (workflow_nom, noeud, message) select '1 - Assistant Garage Avancé', 'Inconnu', 'ancienne erreur ' || g from generate_series(1, 5) g;" >/dev/null

etape="4. droits ramenés à l'état déclaré"
psql_admin -qc "revoke execute on all functions in schema public from anon, authenticated;" >/dev/null

etape="5. migration, deux fois (rejouable)"
echo "== $etape =="
docker cp "$DEPOT/supabase/migrations/$MIGRATION" "$CONTENEUR:/tmp/$MIGRATION" >/dev/null
psql_admin -q -f "/tmp/$MIGRATION" > "$TRAVAIL/migration-1.txt" 2>&1 || { tail -8 "$TRAVAIL/migration-1.txt"; false; }
echo "   OK    $MIGRATION"
psql_admin -q -f "/tmp/$MIGRATION" > "$TRAVAIL/migration-2.txt" 2>&1 || { tail -8 "$TRAVAIL/migration-2.txt"; false; }
echo "   OK    $MIGRATION (second passage)"

etape="6. contrôles"
echo "== $etape =="
docker cp "$DEPOT/docs/recette/controles-journal-incidents.sql" "$CONTENEUR:/tmp/controles.sql" >/dev/null
if [ "${ECHEC_VOLONTAIRE:-}" = controle ]; then
  docker exec "$CONTENEUR" sh -c "printf '%s\n' \"select 'KO échec volontaire (barrière)';\" >> /tmp/controles.sql"
fi
bilan=0
psql_admin -At -f /tmp/controles.sql > "$TRAVAIL/sortie.txt" 2>&1 || bilan=1
grep -oE '(^|NOTICE: +)(OK|KO) .*' "$TRAVAIL/sortie.txt" | sed -E 's/^NOTICE: +//; s/^/   /' || true
nb_ok=$(grep -cE '(^|NOTICE: +)OK ' "$TRAVAIL/sortie.txt" || true)
nb_ko=$(grep -cE '(^|NOTICE: +)KO ' "$TRAVAIL/sortie.txt" || true)
nb_err=$(grep -cE 'ERROR' "$TRAVAIL/sortie.txt" || true)
echo "   $nb_ok OK, $nb_ko KO, $nb_err erreur(s) SQL"
echo "Sorties : $TRAVAIL — pour détruire : docker rm -f $CONTENEUR"
if [ "$bilan" -ne 0 ] || [ "$nb_ko" -ne 0 ] || [ "$nb_err" -ne 0 ] || [ "$nb_ok" -eq 0 ]; then
  echo "RÉSULTAT : ÉCHEC"; exit 1
fi
echo "RÉSULTAT : VERT"

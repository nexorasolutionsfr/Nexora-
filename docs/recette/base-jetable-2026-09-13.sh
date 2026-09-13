#!/bin/bash
# Applique vraiment les sept migrations sur une base jetable construite à
# partir du schéma de la Production, puis joue les contrôles fonctionnels.
#
# Comparer deux listes de migrations ne dit que ceci : les fichiers sont là.
# Pas qu'ils s'appliquent sur le schéma réel, pas que ce qu'ils promettent
# tient. Ce script fait les deux.
#
#   bash docs/recette/base-jetable-2026-09-13.sh
#
# La Production n'est touchée qu'en LECTURE (un dump de schéma). Tout le reste
# se passe dans un conteneur jetable, détruit à la fin si on le demande.

set -u
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:$PATH"

DEPOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRAVAIL="${TRAVAIL:-/tmp/nexora-base-jetable}"
CONTENEUR=nexora-jetable
IMAGE=public.ecr.aws/supabase/postgres:17.6.1.166
mkdir -p "$TRAVAIL"

echo "== 1. Schéma de la Production (lecture seule) =="
if [ ! -s "$TRAVAIL/prod-schema.sql" ]; then
  ( cd "$TRAVAIL" && supabase link --project-ref omphppsmhmyllapdqevn >/dev/null 2>&1
    supabase db dump --linked -f "$TRAVAIL/prod-schema.sql" ) || exit 1
fi
echo "   $(wc -l < "$TRAVAIL/prod-schema.sql") lignes"

echo "== 2. Base jetable =="
docker rm -f $CONTENEUR >/dev/null 2>&1
docker run -d --name $CONTENEUR -e POSTGRES_PASSWORD=jetable -p 55432:5432 $IMAGE >/dev/null || exit 1
for _ in $(seq 1 120); do
  docker logs $CONTENEUR 2>&1 | grep -q 'PostgreSQL init process complete' && \
  docker exec $CONTENEUR pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
docker exec $CONTENEUR psql -U supabase_admin -d postgres -qc \
  "drop publication if exists supabase_realtime; create publication supabase_realtime;" >/dev/null 2>&1

echo "== 3. Chargement du schéma =="
docker cp "$TRAVAIL/prod-schema.sql" $CONTENEUR:/tmp/prod-schema.sql >/dev/null
docker exec $CONTENEUR psql -U supabase_admin -d postgres -f /tmp/prod-schema.sql 2>&1 \
  | grep -iE '^psql.*(ERROR|error:)' && { echo "   chargement en erreur"; exit 1; }
docker exec $CONTENEUR psql -U postgres -tAc \
  "select (select count(*) from pg_tables where schemaname='public')||' tables, '||
          (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')||' fonctions, '||
          (select count(*) from pg_policies where schemaname='public')||' policies'" | sed 's/^/   /'

echo "== 4. Fidélité des droits =="
# Le dump porte « REVOKE ALL … FROM PUBLIC », mais pas les révocations par
# rôle. L'image Supabase, elle, accorde l'exécution à `anon` et `authenticated`
# à la création de toute fonction publique. Sans cette remise à l'état que la
# Production déclare, la copie paraîtrait plus ouverte qu'elle — et le contrôle
# des droits mesurerait un artefact de la copie.
docker exec $CONTENEUR psql -U supabase_admin -d postgres -qc \
  "revoke execute on function public.reserver_notifications(text, integer, uuid[]) from public, anon, authenticated;" >/dev/null
echo "   reserver_notifications ramenée à l'état déclaré par la Production"

echo "== 5. Les sept migrations, dans l'ordre =="
docker exec $CONTENEUR rm -rf /tmp/mig >/dev/null 2>&1
docker cp "$DEPOT/supabase/migrations" $CONTENEUR:/tmp/mig >/dev/null
for f in $(ls -1 "$DEPOT"/supabase/migrations/20260918*.sql | xargs -n1 basename); do
  if docker exec $CONTENEUR psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -f "/tmp/mig/$f" >/dev/null 2>&1
  then echo "   OK    $f"
  else echo "   ÉCHEC $f"; docker exec $CONTENEUR psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f "/tmp/mig/$f" 2>&1 | tail -5; exit 1
  fi
done

echo "== 6. Contrôles fonctionnels =="
docker cp "$DEPOT/docs/recette/controles-base-jetable-2026-09-13.sql" $CONTENEUR:/tmp/controles.sql >/dev/null
docker exec $CONTENEUR psql -U supabase_admin -d postgres -f /tmp/controles.sql 2>&1 \
  | tee "$TRAVAIL/controles-sortie.txt" | sed -n '/^ *bloc/,$p'

echo
echo "Sortie complète : $TRAVAIL/controles-sortie.txt"
echo "Pour détruire la base jetable :  docker rm -f $CONTENEUR"

#!/bin/bash
# Applique les quatre migrations du 14 septembre (20260919000100 → 000400) sur
# une base jetable construite à partir du schéma de la PRODUCTION, puis joue
# les contrôles de docs/recette/controles-base-jetable-2026-09-14.sql.
#
# Même mécanique que base-jetable-2026-09-13.sh, et mêmes pièges évités (voir
# l'en-tête de ce script-là) : on charge dans la base `postgres` de l'image,
# on ne remplace pas le schéma `auth`, `docker exec` sans `-i`, et on ramène
# les droits d'exécution à l'état déclaré avant de les mesurer.
#
#   bash docs/recette/base-jetable-2026-09-14.sh
#
# La Production n'est touchée qu'en LECTURE (un dump de schéma).

set -u
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:$PATH"

DEPOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRAVAIL="${TRAVAIL:-/tmp/nexora-base-jetable-0914}"
CONTENEUR=nexora-jetable-0914
IMAGE=public.ecr.aws/supabase/postgres:17.6.1.166
mkdir -p "$TRAVAIL/supabase"

echo "== 1. Schéma de la Production (lecture seule) =="
if [ ! -s "$TRAVAIL/prod-schema.sql" ]; then
  ( cd "$TRAVAIL" && supabase link --project-ref omphppsmhmyllapdqevn >/dev/null 2>&1
    supabase db dump --linked -f "$TRAVAIL/prod-schema.sql" ) || exit 1
fi
# Rien à pousser depuis ce dossier, jamais.
rm -rf "$TRAVAIL/supabase/migrations"
echo "   $(wc -l < "$TRAVAIL/prod-schema.sql") lignes"

echo "== 2. Base jetable =="
docker rm -f $CONTENEUR >/dev/null 2>&1
docker run -d --name $CONTENEUR -e POSTGRES_PASSWORD=jetable -p 55433:5432 $IMAGE >/dev/null || exit 1
for _ in $(seq 1 120); do
  docker logs $CONTENEUR 2>&1 | grep -q 'PostgreSQL init process complete' && \
  docker exec $CONTENEUR pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
sleep 3
docker exec $CONTENEUR psql -U supabase_admin -d postgres -qc \
  "drop publication if exists supabase_realtime; create publication supabase_realtime;" >/dev/null 2>&1

echo "== 3. Chargement du schéma =="
docker cp "$TRAVAIL/prod-schema.sql" $CONTENEUR:/tmp/prod-schema.sql >/dev/null
docker exec $CONTENEUR psql -U supabase_admin -d postgres -f /tmp/prod-schema.sql > "$TRAVAIL/chargement.txt" 2>&1
if grep -iE '^psql.*(ERROR|error:)' "$TRAVAIL/chargement.txt"; then echo "   chargement en erreur"; exit 1; fi
docker exec $CONTENEUR psql -U postgres -tAc \
  "select (select count(*) from pg_tables where schemaname='public')||' tables, '||
          (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')||' fonctions, '||
          (select count(*) from pg_policies where schemaname='public')||' policies'" | sed 's/^/   /'

echo "== 4. Fidélité des droits =="
docker exec $CONTENEUR psql -U supabase_admin -d postgres -qc \
  "revoke execute on function public.reserver_notifications(text, integer, uuid[]) from public, anon, authenticated;" >/dev/null
echo "   reserver_notifications ramenée à l'état déclaré par la Production"

# LE SCHÉMA `storage` N'EST PAS DANS LA COPIE
# Il est créé par le service de stockage de Supabase, pas par l'image Postgres,
# et le dump de schéma ne le reprend pas. Les migrations 20260919000700/0800
# posent des politiques sur `storage.objects` : sans ce socle minimal, elles ne
# s'appliquent pas ici. Ce socle ne reproduit que les colonnes utilisées ; il
# permet de vérifier le TEXTE des politiques et les droits, pas le comportement
# du service de stockage, qui est prouvé sur Test
# (scripts/recette/constats-mecanicien-serveur.mjs, preuves-devis-serveur.mjs).
docker exec -i $CONTENEUR psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon, service_role;
insert into storage.buckets (id, name, public) values ('inspections-photos', 'inspections-photos', false) on conflict do nothing;
SQL
echo "   socle storage minimal posé (buckets, objects, RLS) — voir le commentaire"

echo "== 5. Les migrations du 14 septembre (20260919*), dans l'ordre =="
docker exec $CONTENEUR rm -rf /tmp/mig >/dev/null 2>&1
docker cp "$DEPOT/supabase/migrations" $CONTENEUR:/tmp/mig >/dev/null
for f in $(ls -1 "$DEPOT"/supabase/migrations/20260919*.sql | xargs -n1 basename); do
  if docker exec $CONTENEUR psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -f "/tmp/mig/$f" >/dev/null 2>&1
  then echo "   OK    $f"
  else echo "   ÉCHEC $f"; docker exec $CONTENEUR psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f "/tmp/mig/$f" 2>&1 | tail -8; exit 1
  fi
done

echo "== 6. Contrôles =="
docker cp "$DEPOT/docs/recette/controles-base-jetable-2026-09-14.sql" $CONTENEUR:/tmp/controles.sql >/dev/null
docker exec $CONTENEUR psql -U supabase_admin -d postgres -v ON_ERROR_STOP=0 -f /tmp/controles.sql > "$TRAVAIL/controles-sortie.txt" 2>&1
grep -E '^ *(OK|KO) ' "$TRAVAIL/controles-sortie.txt" | sed 's/^ */   /'
echo "   $(grep -cE '^ *OK ' "$TRAVAIL/controles-sortie.txt") OK, $(grep -cE '^ *KO ' "$TRAVAIL/controles-sortie.txt") KO"
grep -iE 'ERROR' "$TRAVAIL/controles-sortie.txt" | head -5

echo
echo "Sortie complète : $TRAVAIL/controles-sortie.txt"
echo "Pour détruire la base jetable :  docker rm -f $CONTENEUR"

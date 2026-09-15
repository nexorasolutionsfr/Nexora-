#!/bin/bash
# Applique les migrations du 14 septembre (20260919*) sur une base jetable
# construite à partir d'un export FRAIS du schéma de la PRODUCTION (public ET
# storage), puis joue les contrôles et la vérification de compatibilité du
# retour arrière applicatif.
#
#   bash docs/recette/base-jetable-2026-09-14.sh
#
# BARRIÈRE : le script se termine en ÉCHEC (code ≠ 0) si une commande
# nécessaire échoue, si une migration échoue, si une erreur SQL survient dans
# les contrôles, ou si un seul contrôle est KO (y compris ceux affichés par
# `raise notice`). Code 0 = tout est vert, rien d'autre.
#
# Échec volontaire, pour prouver la barrière :
#   ECHEC_VOLONTAIRE=controle   ajoute un contrôle KO
#   ECHEC_VOLONTAIRE=sql        ajoute une instruction SQL en erreur
#   ECHEC_VOLONTAIRE=migration  ajoute une migration en erreur
#
# La Production n'est touchée qu'en LECTURE (deux exports de schéma).
# Mêmes pièges évités que base-jetable-2026-09-13.sh : chargement dans la base
# `postgres` de l'image, schéma `auth` de l'image conservé, droits ramenés à
# l'état déclaré avant de les mesurer.

set -Eeuo pipefail
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:$PATH"

DEPOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRAVAIL="${TRAVAIL:-/tmp/nexora-base-jetable-$(date +%Y%m%d-%H%M%S)}"
CONTENEUR="${CONTENEUR:-nexora-jetable-0914}"
PORT="${PORT:-55433}"
IMAGE=public.ecr.aws/supabase/postgres:17.6.1.166
ECHEC_VOLONTAIRE="${ECHEC_VOLONTAIRE:-}"

etape="préparation"
trap 'echo; echo "ÉCHEC — étape : $etape (ligne $LINENO)"; exit 1' ERR
mkdir -p "$TRAVAIL/supabase"
psql_admin() { docker exec "$CONTENEUR" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

etape="1. export frais du schéma de Production (lecture seule)"
echo "== $etape =="
# REUTILISER_EXPORT=1 reprend les exports déjà présents dans $TRAVAIL (démonstration
# de la barrière). La répétition avant publication se joue SANS : export frais.
if [ "${REUTILISER_EXPORT:-}" = 1 ] && [ -s "$TRAVAIL/prod-schema.sql" ] && [ -s "$TRAVAIL/prod-storage.sql" ]; then
  echo "   exports existants réutilisés (REUTILISER_EXPORT=1) — pas une répétition de publication"
else
  rm -f "$TRAVAIL/prod-schema.sql" "$TRAVAIL/prod-storage.sql"
  ( cd "$TRAVAIL" && supabase link --project-ref omphppsmhmyllapdqevn >/dev/null 2>&1 \
    && supabase db dump --linked -f "$TRAVAIL/prod-schema.sql" >/dev/null 2>&1 \
    && supabase db dump --linked --schema storage -f "$TRAVAIL/prod-storage.sql" >/dev/null 2>&1 )
fi
rm -rf "$TRAVAIL/supabase/migrations"   # rien à pousser depuis ce dossier, jamais
test -s "$TRAVAIL/prod-schema.sql"
test -s "$TRAVAIL/prod-storage.sql"
echo "   public : $(wc -l < "$TRAVAIL/prod-schema.sql") lignes ; storage : $(wc -l < "$TRAVAIL/prod-storage.sql") lignes ($TRAVAIL)"
echo "   politiques storage.objects réellement en Production :"
grep -oE 'CREATE POLICY "[^"]+" ON "storage"\."objects"' "$TRAVAIL/prod-storage.sql" | sed -E 's/CREATE POLICY "([^"]+)".*/     - \1/' | sort || true

etape="2. base jetable"
echo "== $etape =="
docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
docker run -d --name "$CONTENEUR" -e POSTGRES_PASSWORD=jetable -p "$PORT:5432" "$IMAGE" >/dev/null
pret=0
for _ in $(seq 1 120); do
  if docker logs "$CONTENEUR" 2>&1 | grep -q 'PostgreSQL init process complete' \
     && docker exec "$CONTENEUR" pg_isready -U postgres >/dev/null 2>&1; then pret=1; break; fi
  sleep 2
done
test "$pret" = 1
sleep 3
psql_admin -qc "drop publication if exists supabase_realtime; create publication supabase_realtime;" >/dev/null

etape="3. chargement du schéma public puis storage de Production"
echo "== $etape =="
# Le schéma `storage` vient de la Production : tables, fonctions ET politiques
# réelles de tous les buckets, pour prouver que les politiques de 000700/000800
# coexistent avec celles qui existent vraiment. Il se charge APRÈS `public` :
# ses politiques appellent des fonctions et tables de `public` (constaté le
# 15 septembre : « relation public.garages does not exist » dans l'autre ordre).
docker cp "$TRAVAIL/prod-storage.sql" "$CONTENEUR:/tmp/prod-storage.sql" >/dev/null
docker cp "$TRAVAIL/prod-schema.sql" "$CONTENEUR:/tmp/prod-schema.sql" >/dev/null
psql_admin -f /tmp/prod-schema.sql > "$TRAVAIL/chargement.txt" 2>&1 \
  || { tail -15 "$TRAVAIL/chargement.txt"; false; }
psql_admin -f /tmp/prod-storage.sql > "$TRAVAIL/chargement-storage.txt" 2>&1 \
  || { tail -15 "$TRAVAIL/chargement-storage.txt"; false; }
docker exec "$CONTENEUR" psql -U postgres -tAc \
  "select (select count(*) from pg_tables where schemaname='public')||' tables, '||
          (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')||' fonctions, '||
          (select count(*) from pg_policies where schemaname='public')||' politiques public, '||
          (select count(*) from pg_policies where schemaname='storage')||' politiques storage'" | sed 's/^/   /'
psql_admin -qc "insert into storage.buckets (id, name, public) values ('inspections-photos', 'inspections-photos', false) on conflict (id) do nothing;" >/dev/null

etape="4. fidélité des droits"
echo "== $etape =="
psql_admin -qc "revoke execute on function public.reserver_notifications(text, integer, uuid[]) from public, anon, authenticated;" >/dev/null
echo "   reserver_notifications ramenée à l'état déclaré par la Production"

etape="5. migrations 20260919*, dans l'ordre"
echo "== $etape =="
docker exec "$CONTENEUR" rm -rf /tmp/mig
docker cp "$DEPOT/supabase/migrations" "$CONTENEUR:/tmp/mig" >/dev/null
if [ "$ECHEC_VOLONTAIRE" = migration ]; then
  docker exec "$CONTENEUR" sh -c "echo 'select * from table_qui_n_existe_pas;' > /tmp/mig/20260919999900_echec_volontaire.sql"
fi
for f in $(docker exec "$CONTENEUR" sh -c 'ls -1 /tmp/mig/20260919*.sql' | xargs -n1 basename); do
  if psql_admin -q -f "/tmp/mig/$f" > "$TRAVAIL/migration-$f.txt" 2>&1; then
    echo "   OK    $f"
  else
    echo "   ÉCHEC $f"; tail -8 "$TRAVAIL/migration-$f.txt"; false
  fi
done

etape="6. contrôles et compatibilité du retour arrière"
echo "== $etape =="
docker cp "$DEPOT/docs/recette/controles-base-jetable-2026-09-14.sql" "$CONTENEUR:/tmp/controles.sql" >/dev/null
docker cp "$DEPOT/docs/recette/compat-retour-arriere-2026-09-15.sql" "$CONTENEUR:/tmp/compat.sql" >/dev/null
case "$ECHEC_VOLONTAIRE" in
  controle) docker exec "$CONTENEUR" sh -c "printf '%s\n' \"select 'KO échec volontaire (barrière)';\" >> /tmp/compat.sql" ;;
  sql)      docker exec "$CONTENEUR" sh -c "printf '%s\n' 'select 1/0;' >> /tmp/compat.sql" ;;
esac
bilan=0
for fichier in controles compat; do
  if ! psql_admin -f "/tmp/$fichier.sql" > "$TRAVAIL/$fichier-sortie.txt" 2>&1; then
    echo "   ERREUR SQL dans $fichier :"; grep -E 'ERROR' "$TRAVAIL/$fichier-sortie.txt" | head -5 | sed 's/^/     /' || true
    bilan=1
  fi
done
cat "$TRAVAIL/controles-sortie.txt" "$TRAVAIL/compat-sortie.txt" > "$TRAVAIL/sortie.txt"
# Un contrôle s'affiche soit en début de ligne, soit dans un NOTICE psql.
grep -oE '(^|NOTICE: +)(OK|KO) .*' "$TRAVAIL/sortie.txt" | sed -E 's/^NOTICE: +//; s/^/   /' || true
nb_ok=$(grep -cE '(^|NOTICE: +)OK ' "$TRAVAIL/sortie.txt" || true)
nb_ko=$(grep -cE '(^|NOTICE: +)KO ' "$TRAVAIL/sortie.txt" || true)
nb_err=$(grep -cE 'ERROR' "$TRAVAIL/sortie.txt" || true)
echo "   $nb_ok OK, $nb_ko KO, $nb_err erreur(s) SQL"

echo
echo "Sorties : $TRAVAIL"
echo "Pour détruire la base jetable :  docker rm -f $CONTENEUR"
if [ "$bilan" -ne 0 ] || [ "$nb_ko" -ne 0 ] || [ "$nb_err" -ne 0 ] || [ "$nb_ok" -eq 0 ]; then
  echo "RÉSULTAT : ÉCHEC"
  exit 1
fi
echo "RÉSULTAT : VERT"

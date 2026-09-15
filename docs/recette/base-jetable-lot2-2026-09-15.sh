#!/bin/bash
# Répétition des migrations 20260920000100 (une facture par fiche atelier) et
# 20260920000200 (cohérence client / véhicule des contrôles) sur une base
# jetable chargée d'un export FRAIS du schéma de Production (public + storage).
#
#   bash docs/recette/base-jetable-lot2-2026-09-15.sh [dossier_d_export]
#
# Déroulé : constat AVANT (défauts reproduits), application des deux
# migrations, contrôles APRÈS. Code ≠ 0 sur toute commande, migration ou
# instruction SQL en erreur, et sur tout contrôle KO. La Production n'est lue
# que pour l'export (si aucun dossier d'export n'est fourni).
set -Eeuo pipefail
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:$PATH"

DEPOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRAVAIL="${1:-/tmp/nexora-jetable-lot2-$(date +%Y%m%d-%H%M%S)}"
CONTENEUR="${CONTENEUR:-nexora-jetable-lot2}"
IMAGE=public.ecr.aws/supabase/postgres:17.6.1.166
etape="préparation"
trap 'echo; echo "ÉCHEC — étape : $etape (ligne $LINENO)"; exit 1' ERR
mkdir -p "$TRAVAIL/supabase"
psql_admin() { docker exec -i "$CONTENEUR" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

etape="1. export du schéma de Production (lecture seule)"; echo "== $etape =="
if [ ! -s "$TRAVAIL/prod-schema.sql" ] || [ ! -s "$TRAVAIL/prod-storage.sql" ]; then
  ( cd "$TRAVAIL" && supabase link --project-ref omphppsmhmyllapdqevn >/dev/null 2>&1 \
    && supabase db dump --linked -f "$TRAVAIL/prod-schema.sql" >/dev/null 2>&1 \
    && supabase db dump --linked --schema storage -f "$TRAVAIL/prod-storage.sql" >/dev/null 2>&1 )
fi
rm -rf "$TRAVAIL/supabase/migrations"
test -s "$TRAVAIL/prod-schema.sql"; test -s "$TRAVAIL/prod-storage.sql"
grep -q "factures_une_par_ordre" "$TRAVAIL/prod-schema.sql" && { echo "   la Production porte déjà la migration : pas une répétition"; false; } || true

etape="2. base jetable"; echo "== $etape =="
docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true
docker run -d --name "$CONTENEUR" -e POSTGRES_PASSWORD=jetable "$IMAGE" >/dev/null
for _ in $(seq 1 120); do
  docker logs "$CONTENEUR" 2>&1 | grep -q 'PostgreSQL init process complete' \
    && docker exec "$CONTENEUR" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
sleep 3
psql_admin -qc "drop publication if exists supabase_realtime; create publication supabase_realtime;" >/dev/null

etape="3. chargement public puis storage"; echo "== $etape =="
docker cp "$TRAVAIL/prod-schema.sql" "$CONTENEUR:/tmp/prod-schema.sql" >/dev/null
docker cp "$TRAVAIL/prod-storage.sql" "$CONTENEUR:/tmp/prod-storage.sql" >/dev/null
psql_admin -q -f /tmp/prod-schema.sql > "$TRAVAIL/chargement.txt" 2>&1 || { tail -15 "$TRAVAIL/chargement.txt"; false; }
psql_admin -q -f /tmp/prod-storage.sql > "$TRAVAIL/chargement-storage.txt" 2>&1 || { tail -15 "$TRAVAIL/chargement-storage.txt"; false; }

etape="4. AVANT : données synthétiques et défauts reproduits"; echo "== $etape =="
docker cp "$DEPOT/docs/recette/base-jetable-lot2-avant.sql" "$CONTENEUR:/tmp/avant.sql" >/dev/null
psql_admin -At -f /tmp/avant.sql > "$TRAVAIL/avant.txt" 2>&1 || { tail -15 "$TRAVAIL/avant.txt"; false; }
# Deux insertions réellement concurrentes sur la même fiche (sessions distinctes).
concurrence() {
  local ordre="$1" sortie="$2"
  for s in A B; do
    docker exec "$CONTENEUR" psql -U supabase_admin -d postgres -At -c "
      begin;
      insert into public.factures (garage_id, client_id, vehicule_id, rendez_vous_id, ordre_reparation_id, motif, lignes, montant_ht, montant_ttc, statut)
      select o.garage_id, o.client_id, o.vehicule_id, o.rendez_vous_id, o.id, 'session $s', '[]'::jsonb, 50, 60, 'en_attente'
        from public.ordres_reparation o where o.id = '$ordre';
      select pg_sleep(2);
      commit;" > "$TRAVAIL/$sortie-$s.txt" 2>&1 &
    sleep 0.5
  done
  wait || true
}
concurrence 00000000-0000-4000-8000-00000000b001 concurrence-avant
avant_n=$(psql_admin -At -c "select count(*) from public.factures where ordre_reparation_id = '00000000-0000-4000-8000-00000000b001'")
echo "   AVANT : $avant_n factures pour la même fiche (reproduction attendue : 2)" | tee -a "$TRAVAIL/avant.txt"
grep -E "^(REPRO|KO) " "$TRAVAIL/avant.txt" | sed 's/^/   /' || true

etape="5. migrations 20260920*"; echo "== $etape =="
docker exec "$CONTENEUR" rm -rf /tmp/mig; docker cp "$DEPOT/supabase/migrations" "$CONTENEUR:/tmp/mig" >/dev/null
for f in $(docker exec "$CONTENEUR" sh -c 'ls -1 /tmp/mig/20260920*.sql' | xargs -n1 basename); do
  psql_admin -q -f "/tmp/mig/$f" > "$TRAVAIL/migration-$f.txt" 2>&1 && echo "   OK    $f" || { echo "   ÉCHEC $f"; tail -8 "$TRAVAIL/migration-$f.txt"; false; }
done

etape="6. APRÈS : contrôles"; echo "== $etape =="
compteur_avant=$(psql_admin -At -c "select dernier_numero_facture from public.garages where id = '00000000-0000-4000-8000-0000000000a1'")
concurrence 00000000-0000-4000-8000-00000000b002 concurrence-apres
docker cp "$DEPOT/docs/recette/base-jetable-lot2-apres.sql" "$CONTENEUR:/tmp/apres.sql" >/dev/null
bilan=0
psql_admin -At -v compteur_avant="$compteur_avant" -f /tmp/apres.sql > "$TRAVAIL/apres.txt" 2>&1 || bilan=1
cat "$TRAVAIL"/concurrence-apres-*.txt >> "$TRAVAIL/apres.txt"
grep -oE '(^|NOTICE: +)(OK|KO) .*' "$TRAVAIL/apres.txt" | sed -E 's/^NOTICE: +//; s/^/   /' || true
nb_ok=$(grep -cE '(^|NOTICE: +)OK ' "$TRAVAIL/apres.txt" || true)
nb_ko=$(grep -cE '(^|NOTICE: +)KO ' "$TRAVAIL/apres.txt" || true)
refus=$(cat "$TRAVAIL"/concurrence-apres-*.txt | grep -c "a deja sa facture" || true)
echo "   concurrence après : refus explicites = $refus"
echo "   $nb_ok OK, $nb_ko KO"
echo "Sorties : $TRAVAIL — détruire : docker rm -f $CONTENEUR"
if [ "$bilan" -ne 0 ] || [ "$nb_ko" -ne 0 ] || [ "$nb_ok" -eq 0 ] || [ "$refus" -ne 1 ] || [ "$avant_n" -ne 2 ]; then echo "RÉSULTAT : ÉCHEC"; exit 1; fi
echo "RÉSULTAT : VERT"

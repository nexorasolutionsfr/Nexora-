#!/bin/bash
# Sauvegarde complète d'un projet Supabase Nexora : schéma, rôles, données ET
# fichiers du stockage. Aucun service extérieur, aucune dépense.
#
#   bash scripts/sauvegarde/sauvegarder.sh production ~/Sauvegardes/nexora
#   bash scripts/sauvegarde/sauvegarder.sh test       ~/Sauvegardes/nexora
#
# POURQUOI CE SCRIPT EXISTE
#
# Relevé le 17 septembre 2026 : `supabase backups list` répond
# `pitr_enabled: false` et `backups: []` pour le projet de Production. Aucune
# sauvegarde restaurable n'est listée. Et un `supabase db dump` seul ne suffit
# pas : il ne descend PAS les fichiers du stockage. Une facture déposée par un
# automobiliste n'existerait qu'à un seul endroit.
#
# CE QUE LA SAUVEGARDE COUVRE, ET CE QU'ELLE NE COUVRE PAS : voir le manifeste
# écrit à côté des fichiers, et docs/architecture/nexora-auto-sauvegardes.md.
#
# Rien n'est envoyé nulle part : tout reste dans le dossier indiqué. Ce dossier
# contient des données personnelles réelles — il ne va JAMAIS dans le dépôt.
set -u
# `supabase db dump` passe par Docker : sans lui sur le PATH, il échoue en
# silence et laisse des fichiers VIDES. Constaté le 17 septembre 2026.
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:$PATH"
command -v docker >/dev/null 2>&1 || { echo "Refus : docker est introuvable, les exports de base seraient vides."; exit 1; }

ENVIRONNEMENT="${1:-}"
DESTINATION="${2:-}"
case "$ENVIRONNEMENT" in
  production) REF=omphppsmhmyllapdqevn ;;
  test) REF=slawilafseganlbghgwx ;;
  *) echo "Usage : $0 <production|test> <dossier de destination>"; exit 1 ;;
esac
[ -n "$DESTINATION" ] || { echo "Indiquez un dossier de destination, hors du dépôt."; exit 1; }

DEPOT="$(cd "$(dirname "$0")/../.." && pwd)"
ABSOLU="$(mkdir -p "$DESTINATION" && cd "$DESTINATION" && pwd)"
case "$ABSOLU" in
  "$DEPOT"|"$DEPOT"/*) echo "Refus : la destination est dans le dépôt. Ces fichiers contiennent des données réelles."; exit 1 ;;
esac

HORODATAGE="$(date +%Y%m%d-%H%M)"
DOSSIER="$ABSOLU/$ENVIRONNEMENT-$HORODATAGE"
mkdir -p "$DOSSIER/stockage"
# Miroir jetable : on ne lie jamais le dépôt lui-même à un projet distant.
MIROIR="$(mktemp -d)"
trap 'rm -rf "$MIROIR"' EXIT
cd "$MIROIR" || exit 1
supabase link --project-ref "$REF" >/dev/null 2>&1 || { echo "Liaison impossible avec $ENVIRONNEMENT."; exit 1; }

echo "Sauvegarde de $ENVIRONNEMENT vers $DOSSIER"

echo "  1/4 schéma (schéma public)"
supabase db dump --linked -f "$DOSSIER/schema.sql" >/dev/null 2>&1 || echo "     ÉCHEC"

echo "  2/4 rôles"
supabase db dump --linked --role-only -f "$DOSSIER/roles.sql" >/dev/null 2>&1 || echo "     ÉCHEC"

echo "  3/4 données (public, auth, storage)"
supabase db dump --linked --data-only -f "$DOSSIER/donnees.sql" >/dev/null 2>&1 || echo "     ÉCHEC"

echo "  4/4 fichiers du stockage"
COMPARTIMENTS=$(supabase storage ls ss:/// --linked --experimental 2>/dev/null | grep -o '"[^"]*/"' | tr -d '"/' | grep -v '^$')
NB_FICHIERS=0
for c in $COMPARTIMENTS; do
  supabase storage cp -r "ss:///$c" "$DOSSIER/stockage" --linked --experimental >/dev/null 2>&1
  echo "     compartiment $c"
done
NB_FICHIERS=$(find "$DOSSIER/stockage" -type f 2>/dev/null | wc -l | tr -d ' ')

{
  echo "Sauvegarde Nexora — $ENVIRONNEMENT ($REF)"
  echo "Prise le $(date '+%d %B %Y à %H:%M %Z')"
  echo
  echo "CE QUE CETTE SAUVEGARDE COUVRE"
  echo "  - schema.sql   : le schéma PUBLIC seulement ($(grep -c '^CREATE TABLE' "$DOSSIER/schema.sql" 2>/dev/null) tables)"
  echo "  - roles.sql    : les rôles de la base"
  echo "  - donnees.sql  : les données de public, auth et storage"
  echo "                   ($(grep -c '^INSERT INTO' "$DOSSIER/donnees.sql" 2>/dev/null) tables portant des lignes)"
  echo "  - stockage/    : les fichiers eux-mêmes ($NB_FICHIERS fichier(s))"
  echo
  echo "CE QU'ELLE NE COUVRE PAS"
  echo "  - le schéma des espaces auth et storage : Supabase les fournit lui-même."
  echo "    Une restauration se fait donc dans un projet Supabase, pas dans un Postgres nu."
  echo "  - les réglages du projet (SMTP, adresses de redirection, secrets, variables"
  echo "    d'environnement Vercel) : à noter à part."
  echo "  - les journaux des prestataires."
  echo
  echo "EMPREINTES SHA-256"
  (cd "$DOSSIER" && shasum -a 256 *.sql)
  echo
  echo "RESTAURATION : voir docs/architecture/nexora-auto-sauvegardes.md"
  echo "CES FICHIERS CONTIENNENT DES DONNÉES PERSONNELLES RÉELLES. Ils ne vont"
  echo "jamais dans le dépôt, et ne se partagent pas."
} > "$DOSSIER/MANIFESTE.txt"

chmod -R go-rwx "$DOSSIER" 2>/dev/null
echo
cat "$DOSSIER/MANIFESTE.txt"

# Une sauvegarde vide qui se croit réussie est pire que pas de sauvegarde.
for f in schema.sql donnees.sql; do
  if [ ! -s "$DOSSIER/$f" ]; then
    echo
    echo "ATTENTION : $f est VIDE. Cette sauvegarde n'en est pas une."
    exit 1
  fi
done
echo
echo "Sauvegarde complète et non vide."

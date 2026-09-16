#!/bin/bash
# Contrôle d'avant-bascule : ce qui est RÉELLEMENT dans l'instance n8n, après
# import et AVANT publication.
#
# Vérifie, pour les 5 workflows du socle :
#   - aucune trace de recette (projet Test, host.docker.internal, 127.0.0.1,
#     localhost, ports 5680/8787/8788, garage borné `p_garages`) ;
#   - toutes les URL visent le projet de Production attendu ;
#   - l'identifiant sélectionné sur chaque nœud est bien celui attendu
#     (id ET nom), et il existe dans l'instance avec le bon type ;
#   - cadence, `errorWorkflow`, plafonds de débit, nombre de nœuds.
#
# N'AFFICHE AUCUN SECRET : les identifiants ne sont lus que par id, nom et
# type (`export:credentials` sans `--decrypted` ; le contenu reste chiffré et
# n'est jamais imprimé).
#
#   bash scripts/n8n/controle-avant-bascule.sh [conteneur=nexora-n8n]
#
# Code 0 = tout est conforme. Sinon : NE PAS PUBLIER.
set -uo pipefail
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:$PATH"
CONTENEUR="${1:-nexora-n8n}"
PROJET_PROD="omphppsmhmyllapdqevn"

ids=(erroralerts000000000000000001 jXsssqkdKFR3Hnf9 9IG1g2ZmHQzhnsMS HdO63GrT2WfopDQP X39OgaEUulqhv1hO)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for id in "${ids[@]}"; do
  docker exec "$CONTENEUR" n8n export:workflow --id="$id" 2>/dev/null \
    | python3 -c 'import sys,json; r=sys.stdin.read(); json.dump(json.loads(r[r.find("["):])[0], open(sys.argv[1],"w"))' "$tmp/$id.json" \
    || { echo "KO export impossible pour $id"; exit 1; }
done
# identifiants présents dans l'instance : id, nom, type seulement (jamais les données)
docker exec "$CONTENEUR" n8n export:credentials --all 2>/dev/null \
  | python3 -c 'import sys,json; r=sys.stdin.read(); json.dump([{k:c.get(k) for k in ("id","name","type")} for c in json.loads(r[r.find("["):])], open(sys.argv[1],"w"))' "$tmp/credentials.json" \
  || { echo "KO impossible de lister les identifiants"; exit 1; }

PROJET_PROD="$PROJET_PROD" python3 - "$tmp" <<'PY'
import json, os, re, sys

dossier = sys.argv[1]
prod = os.environ["PROJET_PROD"]
ok = ko = 0

def v(libelle, cond, detail=""):
    global ok, ko
    if cond:
        ok += 1
    else:
        ko += 1
        print(f"  KO {libelle}" + (f" — {detail}" if detail else ""))

ATTENDUS = {
    "erroralerts000000000000000001": {"nom": "3 - Journalisation erreurs", "noeuds": 3, "cron": None, "creds": {"RPC Supabase Production": "fk85N6k6Aea2u0fb"}},
    "jXsssqkdKFR3Hnf9": {"nom": "Véhicule prêt (socle)", "noeuds": 25, "cron": "*/5 * * * *"},
    "9IG1g2ZmHQzhnsMS": {"nom": "Facture (socle)", "noeuds": 25, "cron": "*/5 * * * *"},
    "HdO63GrT2WfopDQP": {"nom": "Proposition RDV (socle)", "noeuds": 26, "cron": "*/5 * * * *"},
    "X39OgaEUulqhv1hO": {"nom": "Nouveau devis (socle)", "noeuds": 25, "cron": "*/2 * * * *"},
}
CREDS_ATTENDUS = {
    "httpCustomAuth": ("fk85N6k6Aea2u0fb", "RPC Supabase Production"),
    "supabaseApi": ("C90K7jXD8RR1HJKP", "Supabase account"),
    "smtp": ("6opiCKNWBLDnvYKJ", "SMTP Brevo — envois métier"),
}
TRACES_RECETTE = re.compile(r"slawilafseganlbghgwx|host\.docker\.internal|127\.0\.0\.1|localhost|:5680|:8787|:8788|RECETTE|fiabrec", re.I)

instance = {c["id"]: c for c in json.load(open(f"{dossier}/credentials.json"))}

for wid, attendu in ATTENDUS.items():
    w = json.load(open(f"{dossier}/{wid}.json"))
    texte = json.dumps(w, ensure_ascii=False)
    etiquette = attendu["nom"]
    v(f"{etiquette} : nom attendu", w["name"] == attendu["nom"], w["name"])
    v(f"{etiquette} : nombre de nœuds", len(w["nodes"]) == attendu["noeuds"], f'{len(w["nodes"])} au lieu de {attendu["noeuds"]}')
    traces = TRACES_RECETTE.findall(texte)
    v(f"{etiquette} : aucune trace de recette", not traces, ", ".join(sorted(set(traces))))
    urls = [n["parameters"]["url"] for n in w["nodes"] if isinstance(n.get("parameters"), dict) and isinstance(n["parameters"].get("url"), str)]
    v(f"{etiquette} : toutes les URL visent la Production", all(u.startswith(f"https://{prod}.supabase.co/") for u in urls), ", ".join(u for u in urls if prod not in u))
    for n in w["nodes"]:
        for typ, cred in (n.get("credentials") or {}).items():
            attendu_cred = CREDS_ATTENDUS.get(typ)
            v(f"{etiquette} / {n['name']} : identifiant {typ} attendu",
              attendu_cred is not None and cred.get("id") == attendu_cred[0] and cred.get("name") == attendu_cred[1],
              f"{cred.get('name')} ({cred.get('id')})")
            present = instance.get(cred.get("id"))
            v(f"{etiquette} / {n['name']} : identifiant présent dans l'instance, bon type et bon nom",
              present is not None and present.get("type") == typ and present.get("name") == cred.get("name"),
              "absent de l'instance" if present is None else f"{present.get('name')} / {present.get('type')}")
    if attendu["cron"]:
        crons = [n["parameters"]["rule"]["interval"][0]["expression"] for n in w["nodes"] if n.get("parameters", {}).get("rule")]
        v(f"{etiquette} : cadence {attendu['cron']}", crons == [attendu["cron"]], ", ".join(crons))
        v(f"{etiquette} : workflow d'erreur rattaché", w.get("settings", {}).get("errorWorkflow") == "erroralerts000000000000000001", str(w.get("settings", {}).get("errorWorkflow")))
        reserve = next((n for n in w["nodes"] if n["name"] == "Réserver la file"), None)
        v(f"{etiquette} : une ligne par réservation, tous garages", reserve is not None and '"p_limite": 1' in reserve["parameters"]["jsonBody"] and '"p_garages": null' in reserve["parameters"]["jsonBody"])
        jeton = next((n for n in w["nodes"] if n["name"] == "Prendre un jeton d'envoi"), None)
        v(f"{etiquette} : jeton de débit commun avant l'envoi", jeton is not None and '"p_limite_heure"' in jeton["parameters"]["jsonBody"])
    else:
        v(f"{etiquette} : n'est pas son propre workflow d'erreur", not w.get("settings", {}).get("errorWorkflow"))
        v(f"{etiquette} : aucun nœud d'envoi", not any(t in n["type"] for n in w["nodes"] for t in ("emailSend", "gmail", "slack", "telegram", "twilio")))

print(f"\n{ok} OK, {ko} KO")
sys.exit(0 if ko == 0 else 1)
PY
code=$?
if [ $code -ne 0 ]; then echo "NE PAS PUBLIER — corriger d'abord."; fi
exit $code

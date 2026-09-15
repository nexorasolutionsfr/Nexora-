#!/bin/bash
# Recours quand le journal des incidents (Supabase) est lui-même indisponible.
#
# Lit en LECTURE SEULE la base SQLite de l'instance n8n (aucune écriture, aucun
# appel réseau) et liste les exécutions en erreur : workflow, id d'exécution,
# date, étape, message expurgé (adresses, liens, jetons retirés).
#
# Limite : n8n ne garde que les 10 000 dernières exécutions par défaut
# (≈ 4 jours au rythme de septembre 2026) — au-delà, seules les files en base
# font foi.
#
#   bash scripts/n8n/incidents-locaux.sh [jours=3] [base=~/Nexora/n8n_data/database.sqlite]
set -euo pipefail
JOURS="${1:-3}"
BASE="${2:-$HOME/Nexora/n8n_data/database.sqlite}"
test -r "$BASE" || { echo "base introuvable : $BASE"; exit 2; }
[[ "$JOURS" =~ ^[0-9]+$ ]] || { echo "jours : entier attendu"; exit 2; }

sqlite3 -readonly -separator $'\t' "file:$BASE?mode=ro" \
  "select e.id, w.name, e.startedAt, e.status, coalesce(d.data, '') from execution_entity e
     join workflow_entity w on w.id = e.workflowId
     left join execution_data d on d.executionId = e.id
    where e.status not in ('success', 'running', 'waiting', 'new')
      and e.startedAt >= datetime('now', '-$JOURS days')
    order by e.startedAt" |
python3 -c '
import sys, json, re
def expurger(t):
    t = re.sub(r"\b(?:https?|wss?)://\S+", "<lien>", t)
    t = re.sub(r"\b(?:Bearer|Basic)\s+\S+", "<autorisation>", t)
    t = re.sub(r"\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){1,2}", "<jeton>", t)
    t = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "<e-mail>", t)
    return re.sub(r"\s+", " ", t).strip()[:160]
n = 0
print("exécution\tdate (UTC)\tstatut\tworkflow\tétape\tmessage")
for ligne in sys.stdin:
    eid, nom, debut, statut, data = ligne.rstrip("\n").split("\t", 4)
    etape, msg = "?", ""
    try:
        arr = json.loads(data)
        R = lambda v: arr[int(v)] if isinstance(v, str) and v.isdigit() else v
        rd = R(R(arr[0])["resultData"])
        etape = R(rd.get("lastNodeExecuted")) or "?"
        err = R(rd.get("error")) if rd.get("error") else {}
        msg = str(R(err.get("message")) or "") if isinstance(err, dict) else ""
    except Exception:
        pass
    n += 1
    print(f"{eid}\t{debut[:19]}\t{statut}\t{nom}\t{etape}\t{expurger(msg)}")
print(f"-- {n} exécution(s) en erreur sur les derniers jours demandés", file=sys.stderr)
'

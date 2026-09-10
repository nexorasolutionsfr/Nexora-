#!/usr/bin/env python3
"""Invariants des variantes générées. `python3 verifier.py` échoue au premier écart."""
import json, os, sys, subprocess, tempfile
ICI = os.path.dirname(os.path.abspath(__file__))
def charger(nom): return json.load(open(os.path.join(ICI, nom), encoding="utf-8"))
def verifier(nom, variante):
    d = charger(nom); raw = json.dumps(d, ensure_ascii=False); noms = {n["name"]: n for n in d["nodes"]}
    ko = []
    def exige(cond, msg):
        if not cond: ko.append(msg)
    exige(d.get("active") is False, "le fichier doit être inactif")
    exige(d.get("id"), "id de workflow requis par n8n import:workflow")
    for interdit in ("lkckirua", "bcd7f692-1c28-435c-87d1-92f84aa0e6bb", "SMTP account", "https://google.com"):
        exige(interdit not in raw, f"reste interdit : {interdit}")
    for mort in ("Webhook - Devis accepté", "Webhook - Devis refusé", "Webhook - Proposition acceptée", "Webhook - Proposition refusée", "confirmer devis", "devis refusé", "confirmer rdv", "refus proposition"):
        exige(mort not in noms, f"branche morte encore présente : {mort}")
    for nm in ("RDV entretien terminés", "RDV terminés aujourd'hui"):
        exige(noms[nm]["parameters"].get("matchType") == "allFilters", f"{nm} : filtres en OU")
    for nm in ("répondre infos manquantes", "Notifier le garage traitement manuel", "notifier le garage aucun créneau", "relance", "avis google"):
        n = noms[nm]; exige(not n.get("disabled"), f"{nm} désactivé"); exige(n["credentials"]["smtp"]["name"] == "SMTP Brevo — envois métier", f"{nm} : pas Brevo")
    exige("nexorasolutions.france@gmail.com" in noms["répondre infos manquantes"]["parameters"]["fromEmail"] or "expediteur" in noms["répondre infos manquantes"]["parameters"]["fromEmail"], "réponse : expéditeur")
    conds = noms["Avis envoyable ? (e-mail client et lien du garage)"]["parameters"]["conditions"]["conditions"]
    exige(len(conds) == 3, "garde avis : 3 conditions attendues (e-mail, lien, statut)")
    exige("automatisation_active" in json.dumps(noms["Réponse envoyable ?"]), "réponse : interrupteur garage absent")
    exige("Garage identifié ?" in noms and "Journaliser l'entrée sans garage" in noms, "garde d'entrée absente")
    # L'import ne doit jamais viser un workflow qu'on veut garder : ni le vivant actif, ni la recette ratée.
    for interdit_id, quoi in (("rw69Oin74O5UwQlc", "le workflow vivant actif"), ("eX5THd6tZIYBas8n", "l'import raté à 361 nœuds")):
        exige(d["id"] != interdit_id, f"id de publication = {quoi} ({interdit_id})")
    # Résolution du garage à l'entrée e-mail : par le destinataire, sans aucun repli.
    exige("Résoudre le garage (adresse de réception)" in noms and "Attacher le garage_id (e-mail entrant)" in noms, "résolution par destinataire absente")
    exige(noms["Résoudre le garage (adresse de réception)"]["parameters"]["filters"]["conditions"][0]["keyName"] == "gmail_adresse", "résolution : mauvaise colonne")
    exige("trouves.length === 1" in noms["Attacher le garage_id (e-mail entrant)"]["parameters"]["jsCode"], "résolution : une correspondance ambiguë ne bloque pas")
    # Nature des messages : la mention de retrait est sur les sollicitations, pas sur le transactionnel.
    RETRAIT = "ne souhaitez plus recevoir"
    for nm in ("avis google", "relance"):
        exige(RETRAIT in json.dumps(noms[nm], ensure_ascii=False) or RETRAIT in json.dumps(noms.get("Préparer la relance", {}), ensure_ascii=False), f"{nm} : sollicitation sans moyen de retrait")
    for nm in ("répondre infos manquantes", "Notifier le garage traitement manuel", "notifier le garage aucun créneau"):
        exige(RETRAIT not in json.dumps(noms[nm], ensure_ascii=False), f"{nm} : mention de retrait sur un message transactionnel")
    exige("if (!j.source) return []" in noms["Point d'entrée unifié"]["parameters"]["jsCode"], "retour de boucle non filtré")
    supa = {n["credentials"]["supabaseApi"]["name"] for n in d["nodes"] if "supabaseApi" in (n.get("credentials") or {})}
    attendu = {"Supabase RECETTE (Test)"} if variante == "recette" else {"Supabase account"}
    exige(supa == attendu, f"identifiants Supabase : {supa}")
    if variante == "recette":
        exige(all(n["parameters"]["path"].startswith("recette-") for n in d["nodes"] if n["type"] == "n8n-nodes-base.webhook"), "webhooks de recette non préfixés")
        exige(noms["Email Trigger (IMAP)"].get("disabled") and noms["Tous les jours à 9h"].get("disabled"), "déclencheurs de recette non désactivés")
    else:
        exige(noms["Tous les jours à 9h"].get("disabled") is True, "prod : relance doit être désactivée")
        exige(noms["Email Trigger (IMAP)"].get("disabled") is True, "prod : IMAP doit être désactivé")
        exige(not noms["Tous les jours à 18h30"].get("disabled"), "prod : avis doit rester actif")
    for s, spec in d["connections"].items():
        exige(s in noms, f"connexion depuis un nœud absent : {s}")
        for out in spec.get("main", []) or []:
            for c in (out or []): exige(c["node"] in noms, f"{s} -> nœud absent {c['node']}")
    # Un nœud Code au JS invalide ne se voit qu'à l'exécution, en Production. On le voit ici.
    for n in d["nodes"]:
        js = (n.get("parameters") or {}).get("jsCode")
        if not js: continue
        with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as f:
            f.write("(async function(){\n" + js + "\n});"); chemin = f.name
        r = subprocess.run(["node", "--check", chemin], capture_output=True, text=True)
        os.unlink(chemin)
        exige(r.returncode == 0, f"JS invalide dans « {n['name']} » : " + (next((l for l in r.stderr.split(chr(10)) if "Error" in l), r.stderr.strip()[:120]) if r.stderr else "?"))
    for pat in ("eyJhbGciOi", "xsmtpsib-", "sk-ant-", "xkeysib-"):
        exige(pat not in raw, f"secret dans l'export : {pat}")
    return ko
erreurs = {nom: verifier(nom, v) for nom, v in (("recette-test.json", "recette"), ("production.json", "production"))}
for nom, ko in erreurs.items():
    print(f"{nom}: " + ("OK" if not ko else "ÉCHEC\n  - " + "\n  - ".join(ko)))
sys.exit(1 if any(erreurs.values()) else 0)

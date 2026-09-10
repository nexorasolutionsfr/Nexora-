#!/usr/bin/env python3
"""Construit les variantes de l'Assistant Garage à partir de base.json.

    python3 construire.py            -> recette-test.json + production.json

Ce que fait la transformation (voir README.md) :
  M1  supprime les 4 branches webhook mortes (accepté/refusé devis et proposition),
      couvertes depuis le socle par les triggers de base ;
  M2  plus aucun garage par défaut : un message entrant sans garage est journalisé, pas traité ;
  M3  « répondre infos manquantes » part au nom du garage, Reply-To vers lui, via Brevo ;
  M4  les deux notifications internes vont à l'adresse du garage concerné, pas à une boîte fixe ;
  M5  la relance recontrôle le rendez-vous au moment de l'envoi et part au nom du garage
      (déclencheur désactivé en Production : sollicitation commerciale sans désinscription) ;
  M6  l'avis n'est envoyé que si le client a un e-mail ET si le garage a renseigné son lien.
Aucun secret : seules des références d'identifiants n8n (id + nom).
"""
import json, copy, sys, os, re

ICI = os.path.dirname(os.path.abspath(__file__))
NEXORA_FROM = "nexorasolutions.france@gmail.com"
CRED_BREVO = {"id": "6opiCKNWBLDnvYKJ", "name": "SMTP Brevo — envois métier"}
CRED_SUPA_PROD = {"id": "C90K7jXD8RR1HJKP", "name": "Supabase account"}
CRED_SUPA_TEST = {"id": "UcypEtKPfdzK32kR", "name": "Supabase RECETTE (Test)"}
BOITES_RECETTE = [
    "baptiste.papoul52+socle-alpha@gmail.com", "baptiste.papoul52+socle-beta@gmail.com",
    "baptiste.papoul52+socle-clientalpha@gmail.com", "baptiste.papoul52+socle-clientbeta@gmail.com",
]
MORTS = ["Webhook - Devis accepté", "Webhook - Devis refusé", "Webhook - Proposition acceptée", "Webhook - Proposition refusée"]
HARDCODE = '"bcd7f692-1c28-435c-87d1-92f84aa0e6bb"'

class WF:
    def __init__(self, d):
        self.d = copy.deepcopy(d); self.nodes = self.d["nodes"]; self.conns = self.d["connections"]
    def node(self, name):
        for n in self.nodes:
            if n["name"] == name: return n
        raise KeyError(name)
    def has(self, name): return any(n["name"] == name for n in self.nodes)
    def succ(self, name, out=0):
        m = self.conns.get(name, {}).get("main", [])
        return [c["node"] for c in (m[out] if out < len(m) else [])]
    def preds(self):
        p = {}
        for s, spec in self.conns.items():
            for i, out in enumerate(spec.get("main", []) or []):
                for c in (out or []): p.setdefault(c["node"], []).append((s, i))
        return p
    def remove(self, names):
        names = set(names)
        self.nodes[:] = [n for n in self.nodes if n["name"] not in names]
        for nm in list(self.conns):
            if nm in names: del self.conns[nm]; continue
            for out in self.conns[nm].get("main", []) or []:
                out[:] = [c for c in out if c["node"] not in names]
    def add(self, n):
        assert not self.has(n["name"]), n["name"]; self.nodes.append(n); return n
    def set_out(self, src, out, targets):
        m = self.conns.setdefault(src, {}).setdefault("main", [])
        while len(m) <= out: m.append([])
        m[out] = [{"node": t, "type": "main", "index": 0} for t in targets]
    def insert_between(self, src, dst, new_name, out=None):
        """Rebranche src->dst en src->new->dst sur la sortie qui pointait vers dst."""
        m = self.conns[src]["main"]
        outs = [i for i, o in enumerate(m) if any(c["node"] == dst for c in (o or []))]
        assert outs, f"{src} -> {dst} introuvable"
        if out is None: out = outs[0]
        m[out] = [c if c["node"] != dst else {"node": new_name, "type": "main", "index": 0} for c in m[out]]
        self.set_out(new_name, 0, [dst])
    def pos(self, name, dx=0, dy=0):
        x, y = self.node(name)["position"]; return [x + dx, y + dy]
    def check(self):
        names = {n["name"] for n in self.nodes}
        for s, spec in self.conns.items():
            assert s in names, f"connexion depuis un noeud absent : {s}"
            for out in spec.get("main", []) or []:
                for c in (out or []): assert c["node"] in names, f"{s} -> noeud absent {c['node']}"
        assert len(names) == len(self.nodes), "noms dupliqués"

# --- fabriques ---------------------------------------------------------------
_uid = [0]
def uid(p):
    _uid[0] += 1; return f"{p}-{_uid[0]:03d}"
def supabase_get(name, table, key_expr, pos):
    return {"parameters": {"operation": "get", "tableId": table, "filters": {"conditions": [{"keyName": "id", "keyValue": key_expr}]}},
            "id": uid("get"), "name": name, "type": "n8n-nodes-base.supabase", "typeVersion": 1, "position": pos, "credentials": {"supabaseApi": dict(CRED_SUPA_PROD)}}
def supabase_where(name, table, colonne, val_expr, pos):
    """getAll filtré sur une colonne : `alwaysOutputData` pour qu'une absence de résultat
    continue quand même vers la garde (sinon la branche meurt sans motif journalisé)."""
    return {"parameters": {"operation": "getAll", "tableId": table, "returnAll": True,
                           "filters": {"conditions": [{"keyName": colonne, "condition": "eq", "keyValue": val_expr}]}},
            "id": uid("where"), "name": name, "type": "n8n-nodes-base.supabase", "typeVersion": 1,
            "position": pos, "alwaysOutputData": True, "credentials": {"supabaseApi": dict(CRED_SUPA_PROD)}}
def cond_empty(expr): return {"id": uid("c"), "leftValue": expr, "rightValue": "", "operator": {"type": "string", "operation": "empty", "singleValue": True}}
def journal(name, type_, texte_expr, pos, garage_expr=None):
    fv = [{"fieldId": "type", "fieldValue": type_}, {"fieldId": "texte", "fieldValue": texte_expr}]
    if garage_expr: fv.insert(0, {"fieldId": "garage_id", "fieldValue": garage_expr})
    return {"parameters": {"tableId": "actions_ia", "fieldsUi": {"fieldValues": fv}},
            "id": uid("journal"), "name": name, "type": "n8n-nodes-base.supabase", "typeVersion": 1, "position": pos, "credentials": {"supabaseApi": dict(CRED_SUPA_PROD)}}
def cond_notempty(expr): return {"id": uid("c"), "leftValue": expr, "rightValue": "", "operator": {"type": "string", "operation": "notEmpty", "singleValue": True}}
def cond_true(expr): return {"id": uid("c"), "leftValue": expr, "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}
def if_node(name, conds, pos):
    return {"parameters": {"conditions": {"options": {"caseSensitive": True, "typeValidation": "loose", "version": 2}, "combinator": "and", "conditions": conds}, "options": {}},
            "id": uid("if"), "name": name, "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": pos}
def code_node(name, js, pos):
    return {"parameters": {"jsCode": js}, "id": uid("code"), "name": name, "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos}
def webhook_node(name, path, pos):
    return {"parameters": {"httpMethod": "POST", "path": path, "options": {}},
            "id": uid("wh"), "name": name, "type": "n8n-nodes-base.webhook", "typeVersion": 2,
            "position": pos, "webhookId": uid("whid")}
def sticky(name, content, pos, w=520, h=200):
    return {"parameters": {"content": content, "height": h, "width": w, "color": 3}, "id": uid("note"), "name": name, "type": "n8n-nodes-base.stickyNote", "typeVersion": 1, "position": pos}
def email_brevo(n, from_expr, to_expr, reply_expr=None):
    p = n["parameters"]; p["fromEmail"] = from_expr; p["toEmail"] = to_expr
    p.setdefault("options", {})["appendAttribution"] = False
    if reply_expr: p["options"]["replyTo"] = reply_expr
    else: p["options"].pop("replyTo", None)
    n["credentials"] = {"smtp": dict(CRED_BREVO)}
FROM_NEXORA = f"Nexora <{NEXORA_FROM}>"
def from_garage(nom_expr):  # nom_expr = expression JS donnant le nom du garage
    return "={{ (" + nom_expr + " || 'Votre garage').replace(/[,<>\"]/g, ' ').trim() + ' <" + NEXORA_FROM + ">' }}"

# --- transformation commune ---------------------------------------------------
def transformer(base):
    wf = WF(base)
    # M1 — code mort : tout ce qui n'est atteignable que depuis les 4 webhooks morts.
    succ = {}
    for s, spec in wf.conns.items():
        for out in spec.get("main", []) or []:
            for c in (out or []): succ.setdefault(s, set()).add(c["node"])
    preds = wf.preds()
    def reach(starts):
        vu, st = set(), list(starts)
        while st:
            x = st.pop()
            if x in vu: continue
            vu.add(x); st += list(succ.get(x, ()))
        return vu
    vivants = [n["name"] for n in wf.nodes if not preds.get(n["name"]) and n["name"] not in MORTS and n["type"] != "n8n-nodes-base.stickyNote"]
    a_supprimer = reach(MORTS) - reach(vivants)
    assert len(a_supprimer) == 27, len(a_supprimer)
    wf.remove(a_supprimer)

    # M2 — plus de garage par défaut ; un message sans garage est journalisé, pas traité.
    g = wf.node("Normaliser (Gmail)"); assert HARDCODE in g["parameters"]["jsCode"]
    g["parameters"]["jsCode"] = g["parameters"]["jsCode"].replace(f"msg.garage_id || {HARDCODE}", "msg.garage_id || null")
    assert HARDCODE not in g["parameters"]["jsCode"]
    # Défaut préexistant rendu visible par la garde : la boucle « Traiter un email à la fois » reçoit en
    # retour le résultat SMTP du dernier envoi et le réémet comme s'il s'agissait d'un nouveau message.
    # Un item qui n'est pas un message normalisé (pas de `source`) est abandonné ici, sans bruit.
    pe = wf.node("Point d'entrée unifié")
    pe["parameters"]["jsCode"] = ("const j = $input.first().json || {};\n"
        "if (!j.source) return [];  // retour de boucle (résultat SMTP, etc.) : ce n'est pas un message\n"
        "return [{ json: j }];")
    (suiv,) = wf.succ("Point d'entrée unifié")
    wf.add(if_node("Garage identifié ?", [cond_notempty("={{ $json.garage_id }}")], wf.pos("Point d'entrée unifié", 220, 0)))
    wf.insert_between("Point d'entrée unifié", suiv, "Garage identifié ?")
    wf.add(journal("Journaliser l'entrée sans garage", "entree_sans_garage",
                   "={{ 'Message entrant (' + ($json.source || 'inconnu') + ') sans garage identifié : non traité' + ($json.motif_resolution ? ' \u2014 ' + $json.motif_resolution : '') + ($json.destinataire ? ' (destinataire : ' + $json.destinataire + ')' : '') }}",
                   wf.pos("Point d'entrée unifié", 220, 220)))
    wf.set_out("Garage identifié ?", 1, ["Journaliser l'entrée sans garage"])

    # M2b — quel garage pour un e-mail entrant ? La seule donnée fiable est le DESTINATAIRE :
    # l'adresse à laquelle le client a écrit. C'est exactement ce que fait déjà WhatsApp
    # (`body.To` -> `garages.numero_whatsapp`). Symétrique ici : Delivered-To / X-Original-To /
    # To -> `garages.gmail_adresse`. L'expéditeur, lui, n'apprend rien : un même client peut
    # écrire à plusieurs garages, et l'adresse d'envoi est falsifiable.
    # Pas de repli : sans correspondance, garage_id reste null et la garde M2 refuse le message.
    g = wf.node("Normaliser (Gmail)"); js = g["parameters"]["jsCode"]
    js = js.replace('function texte(v){', r"""function destinataire(msg) {
  // En-têtes d'acheminement d'abord : ce sont ceux que le serveur a réellement utilisés.
  const h = (msg.headers || (msg.metadata || {}).headers || msg.metadata || {});
  const brut = h["delivered-to"] || h["Delivered-To"] || h["x-original-to"] || h["X-Original-To"] || msg.to || "";
  const v = typeof brut === "object" ? (brut.text || ((brut.value || [])[0] || {}).address || "") : String(brut);
  const m = String(v).match(/<([^<>]+)>/);
  return (m ? m[1] : String(v).split(",")[0]).trim().toLowerCase();
}
function texte(v){""")
    js = js.replace("    garage_id: msg.garage_id || null,",
                    "    garage_id: msg.garage_id || null,\n    destinataire: destinataire(msg),")
    assert "destinataire(msg)" in js and "gmail_adresse" not in js; g["parameters"]["jsCode"] = js

    wf.add(if_node("Garage à résoudre par l'adresse de réception ?",
                   [cond_empty("={{ $json.garage_id }}"), cond_notempty("={{ $json.destinataire }}")],
                   wf.pos("Point d'entrée unifié", -110, 0)))
    # La résolution doit se placer AVANT « Point d'entrée unifié » : plusieurs nœuds en aval
    # relisent ce nœud (`$('Point d'entrée unifié')`) et retrouveraient sinon le garage d'avant
    # résolution, c'est-à-dire nul. Défaut trouvé en recette le 10 septembre.
    wf.insert_between("Traiter un email à la fois", "Point d'entrée unifié", "Garage à résoudre par l'adresse de réception ?")
    wf.add(supabase_where("Résoudre le garage (adresse de réception)", "garages", "gmail_adresse",
                          "={{ $json.destinataire }}", wf.pos("Point d'entrée unifié", -110, -180)))
    wf.add(code_node("Attacher le garage_id (e-mail entrant)", """
// Résolution certaine ou refus : exactement UNE correspondance, sinon garage_id reste null et
// la garde suivante journalise sans rien exécuter. Rien ne garantit en base que gmail_adresse
// soit unique ; deux garages sur la même adresse doivent bloquer, pas être départagés au hasard.
const original = $("Traiter un email à la fois").first().json || {};
const trouves = $input.all().map(i => i.json).filter(g => g && g.id);
const garage = trouves.length === 1 ? trouves[0] : null;
return [{ json: { ...original, garage_id: garage ? garage.id : null,
  motif_resolution: garage ? '' : (trouves.length > 1
    ? 'adresse de réception partagée par ' + trouves.length + ' garages'
    : 'aucun garage pour cette adresse de réception') } }];""",
                     wf.pos("Point d'entrée unifié", 0, -180)))
    wf.set_out("Garage à résoudre par l'adresse de réception ?", 0, ["Résoudre le garage (adresse de réception)"])
    wf.set_out("Garage à résoudre par l'adresse de réception ?", 1, ["Point d'entrée unifié"])
    wf.set_out("Résoudre le garage (adresse de réception)", 0, ["Attacher le garage_id (e-mail entrant)"])
    wf.set_out("Attacher le garage_id (e-mail entrant)", 0, ["Point d'entrée unifié"])

    # M3 — réponse « infos manquantes » au nom du garage.
    wf.add(supabase_get("Récupérer le garage (réponse)", "garages", "={{ $('Parser la réponse IA').item.json.garage_id }}", wf.pos("Construire le message de relance infos", -240, 0)))
    # Deux chemins mènent à la réponse (demande existante mise à jour, ou demande créée) : le garage est lu sur les deux.
    for (src, out) in wf.preds()["Construire le message de relance infos"]:
        wf.insert_between(src, "Construire le message de relance infos", "Récupérer le garage (réponse)", out)
    c = wf.node("Construire le message de relance infos"); js = c["parameters"]["jsCode"]
    js = js.replace("const base = $('Parser la réponse IA').item.json;",
                    "const base = $('Parser la réponse IA').item.json;\n"
                    "const garage = $('Récupérer le garage (réponse)').item.json || {};\n"
                    "const nomGarage = String(garage.nom_garage || '').replace(/[,<>\"]/g, ' ').trim();")
    js = js.replace("L'équipe du garage`;", "${nomGarage || 'Votre garage'}`;")
    js = js.replace("return [{ json: { ...base, message_reponse } }];",
                    "return [{ json: { ...base, message_reponse, nom_garage: nomGarage, garage_email: garage.email || '',\n"
                    "  expediteur: nomGarage ? nomGarage + ' <" + NEXORA_FROM + ">' : '' } }];")
    assert "nomGarage" in js and "L'équipe du garage" not in js; c["parameters"]["jsCode"] = js
    wf.add(if_node("Réponse envoyable ?", [cond_notempty("={{ $json.email }}"), cond_notempty("={{ $json.expediteur }}")], wf.pos("répondre infos manquantes", -240, 0)))
    wf.insert_between("Canal WhatsApp ?", "répondre infos manquantes", "Réponse envoyable ?")
    wf.add(journal("Journaliser la réponse non envoyée", "reponse_non_envoyee",
                   "={{ !$json.email ? 'Réponse non envoyée : le client n\\'a pas d\\'adresse e-mail' : 'Réponse non envoyée : garage introuvable' }}",
                   wf.pos("répondre infos manquantes", -240, 200), "={{ $json.garage_id }}"))
    wf.set_out("Réponse envoyable ?", 1, ["Journaliser la réponse non envoyée"])
    email_brevo(wf.node("répondre infos manquantes"), "={{ $json.expediteur }}", "={{ $json.email }}", "={{ $json.garage_email }}")

    # M4a — notification interne « traitement manuel » : à l'adresse du garage concerné.
    wf.add(supabase_get("Récupérer le garage (manuel)", "garages", "={{ $json.garage_id }}", wf.pos("Notifier le garage traitement manuel", -480, 0)))
    wf.insert_between("Est-ce pertinent pour le garage ?", "Notifier le garage traitement manuel", "Récupérer le garage (manuel)")
    wf.add(if_node("Garage joignable ? (manuel)", [cond_notempty("={{ $json.email }}")], wf.pos("Notifier le garage traitement manuel", -240, 0)))
    wf.insert_between("Récupérer le garage (manuel)", "Notifier le garage traitement manuel", "Garage joignable ? (manuel)")
    wf.add(journal("Journaliser le garage injoignable (manuel)", "garage_injoignable",
                   "={{ 'Demande à traiter manuellement non transmise : le garage n\\'a pas d\\'adresse e-mail (Paramètres > Informations garage)' }}",
                   wf.pos("Notifier le garage traitement manuel", -240, 200), "={{ $json.id }}"))
    wf.set_out("Garage joignable ? (manuel)", 1, ["Journaliser le garage injoignable (manuel)"])
    n = wf.node("Notifier le garage traitement manuel")
    for k in ("subject", "text"): n["parameters"][k] = n["parameters"][k].replace("$json.", "$('Parser la réponse IA').item.json.")
    email_brevo(n, FROM_NEXORA, "={{ $json.email }}")

    # M4b — « aucun créneau » : le garage a déjà été lu dans cette branche.
    GAR = "$('Récupérer les horaires du garage').first().json"
    wf.add(if_node("Garage joignable ? (créneau)", [cond_notempty("={{ " + GAR + ".email }}")], wf.pos("notifier le garage aucun créneau", -240, 0)))
    wf.insert_between("Créneau trouvé ?", "notifier le garage aucun créneau", "Garage joignable ? (créneau)")
    wf.add(journal("Journaliser le garage injoignable (créneau)", "garage_injoignable",
                   "={{ 'Aucun créneau trouvé et garage sans adresse e-mail : demande non transmise' }}",
                   wf.pos("notifier le garage aucun créneau", -240, 200), "={{ " + GAR + ".id }}"))
    wf.set_out("Garage joignable ? (créneau)", 1, ["Journaliser le garage injoignable (créneau)"])
    email_brevo(wf.node("notifier le garage aucun créneau"), FROM_NEXORA, "={{ " + GAR + ".email }}")

    # M5 — relance : recontrôle au moment de l'envoi, au nom du garage.
    assert wf.succ("Récupérer le client (relance)") == ["relance"]
    assert wf.succ("relance") == ["Journaliser la relance"]
    assert set(wf.succ("Journaliser la relance")) == {"Traiter un par un (relance)", "Marquer la relance envoyée"}
    p = wf.pos("relance")
    wf.add(supabase_get("Recontrôler le rendez-vous (relance)", "rendez_vous", "={{ $('Traiter un par un (relance)').item.json.id }}", [p[0]-720, p[1]]))
    wf.add(supabase_get("Récupérer le garage (relance)", "garages", "={{ $('Recontrôler le rendez-vous (relance)').item.json.garage_id }}", [p[0]-480, p[1]]))
    wf.add(code_node("Préparer la relance", r"""// Rien ne part sur un état ancien : on relit le rendez-vous et le garage à l'instant de l'envoi.
const client = $('Récupérer le client (relance)').item.json || {};
const rdv = $('Recontrôler le rendez-vous (relance)').item.json || {};
const garage = $input.first().json || {};
const nomGarage = String(garage.nom_garage || '').replace(/[,<>"]/g, ' ').trim();
const email = String(client.email || '').trim().toLowerCase();
let motif = '';
if (rdv.statut !== 'termine') motif = 'Relance sans objet : le rendez-vous n\'est plus « terminé » (' + (rdv.statut || 'inconnu') + ')';
else if (rdv.relance_envoyee === true) motif = 'Relance déjà envoyée pour ce rendez-vous';
else if (!email) motif = 'Relance non envoyée : le client n\'a pas d\'adresse e-mail';
else if (!nomGarage) motif = 'Relance non envoyée : garage introuvable';
const texte = `Bonjour ${client.nom || ''},\n\nCela fait un moment depuis votre dernier entretien chez ${nomGarage}. Souhaitez-vous prendre rendez-vous ? Il suffit de répondre à ce message.\n\nSi vous ne souhaitez plus recevoir ces rappels, dites-le-nous en répondant : nous en tiendrons compte.\n\n${nomGarage}`;
return [{ json: { envoyable: !motif, motif, garage_id: garage.id || rdv.garage_id || null, client_email: email, nom: client.nom || '',
  expediteur: nomGarage ? nomGarage + ' <""" + NEXORA_FROM + r"""' : '', garage_email: garage.email || '', texte,
  sujet: `Votre entretien chez ${nomGarage || 'votre garage'}` } }];""", [p[0]-240, p[1]]))
    wf.add(if_node("Relance encore justifiée ?", [cond_true("={{ $json.envoyable }}")], [p[0]-120, p[1]]))
    wf.set_out("Récupérer le client (relance)", 0, ["Recontrôler le rendez-vous (relance)"])
    wf.set_out("Recontrôler le rendez-vous (relance)", 0, ["Récupérer le garage (relance)"])
    wf.set_out("Récupérer le garage (relance)", 0, ["Préparer la relance"])
    wf.set_out("Préparer la relance", 0, ["Relance encore justifiée ?"])
    wf.set_out("Relance encore justifiée ?", 0, ["relance"])
    wf.add(journal("Journaliser la relance non envoyée", "relance_non_envoyee", "={{ $json.motif }}", [p[0], p[1]+200], "={{ $json.garage_id }}"))
    wf.set_out("Relance encore justifiée ?", 1, ["Journaliser la relance non envoyée"])
    # Même sortie que le journal d'envoi : la boucle continue et la ligne est marquée pour ne plus être reprise.
    wf.set_out("Journaliser la relance non envoyée", 0, ["Traiter un par un (relance)", "Marquer la relance envoyée"])
    r = wf.node("relance"); r["parameters"]["subject"] = "={{ $json.sujet }}"; r["parameters"]["text"] = "={{ $json.texte }}"
    email_brevo(r, "={{ $json.expediteur }}", "={{ $json.client_email }}", "={{ $json.garage_email }}")
    wf.node("Journaliser la relance")["parameters"]["fieldsUi"]["fieldValues"] = [
        {"fieldId": "garage_id", "fieldValue": "={{ $('Préparer la relance').item.json.garage_id }}"},
        {"fieldId": "type", "fieldValue": "relance"},
        {"fieldId": "texte", "fieldValue": "={{ 'Relance entretien envoyée à ' + $('Préparer la relance').item.json.nom }}"}]

    # M5b/M6b — défaut préexistant vu en recette : les deux sélections (relance, avis) combinaient leurs
    # filtres en OU (matchType par défaut du nœud Supabase) : un rendez-vous annulé avec relance_envoyee=false
    # sortait comme « terminé ». On force le ET, et l'avis vérifie en plus le statut à l'instant de l'envoi.
    for nm in ("RDV entretien terminés", "RDV terminés aujourd'hui"):
        wf.node(nm)["parameters"]["matchType"] = "allFilters"
    # M6 — avis : e-mail client ET lien d'avis du garage, sinon motif journalisé.
    ifa = wf.node("Le client a-t-il un e-mail ?"); ifa["name"] = "Avis envoyable ? (e-mail client et lien du garage)"
    wf.conns["Avis envoyable ? (e-mail client et lien du garage)"] = wf.conns.pop("Le client a-t-il un e-mail ?")
    for s, spec in wf.conns.items():
        for out in spec.get("main", []) or []:
            for c in (out or []):
                if c["node"] == "Le client a-t-il un e-mail ?": c["node"] = "Avis envoyable ? (e-mail client et lien du garage)"
    ifa["parameters"]["conditions"]["conditions"].append(cond_notempty("={{ $json.lien_avis_google }}"))
    ifa["parameters"]["conditions"]["conditions"].append({"id": uid("c"), "leftValue": "={{ $('Traiter un par un (avis)').item.json.statut }}", "rightValue": "termine", "operator": {"type": "string", "operation": "equals"}})
    assert wf.succ("Avis envoyable ? (e-mail client et lien du garage)", 1) == ["Marquer l'avis demandé"]
    wf.add(journal("Journaliser l'avis non envoyé", "avis_non_envoye",
                   "={{ !$('Récupérer le client (avis)').item.json.email ? 'Avis non envoyé : le client n\\'a pas d\\'adresse e-mail' : 'Avis non envoyé : aucun lien d\\'avis Google renseigné pour ce garage (Paramètres > Objectif & avis)' }}",
                   wf.pos("avis google", 0, 220), "={{ $json.id }}"))
    wf.set_out("Avis envoyable ? (e-mail client et lien du garage)", 1, ["Journaliser l'avis non envoyé"])
    wf.set_out("Journaliser l'avis non envoyé", 0, ["Marquer l'avis demandé"])
    a = wf.node("avis google"); t = a["parameters"]["text"]
    assert '($json.lien_avis_google || "https://google.com")' in t
    t = t.replace('($json.lien_avis_google || "https://google.com")', "$json.lien_avis_google").replace('"\\n\\nL\'équipe du garage"', '"\\n\\n" + ($json.nom_garage || "Votre garage")')
    # Nature du message : la demande d'avis n'est pas une notification de service, c'est une
    # sollicitation. C'est le seul envoi de ce type qui soit actif en Production. L'accord du
    # garage existe déjà (il doit avoir renseigné `lien_avis_google` : sans lien, rien ne part) ;
    # ce qui manquait, c'est le moyen de retrait côté client. Le Reply-To va au garage.
    # Les messages transactionnels (réponse à un message entrant, notifications internes) ne
    # portent pas cette mention : elle n'a pas lieu d'être sur une réponse qu'on a sollicitée.
    RETRAIT = ('"\\n\\nSi vous ne souhaitez plus recevoir ce type de message, '
               'dites-le-nous en répondant : nous en tiendrons compte.\\n\\n"')
    t = t.replace('+ "\\n\\n" + ($json.nom_garage', '+ ' + RETRAIT + ' + ($json.nom_garage')
    assert "ne souhaitez plus recevoir" in t, t[-200:]
    assert "google.com\"" not in t and "L'équipe du garage" not in t; a["parameters"]["text"] = t
    email_brevo(a, from_garage("$json.nom_garage"), "={{ $('Récupérer le client (avis)').item.json.email }}", "={{ $json.email || '' }}")

    # Les trois e-mails ci-dessous étaient désactivés dans la version vivante (ils n'ont jamais envoyé) :
    # ils partent désormais au nom du bon garage, avec garde-fou, donc on les rallume.
    for nm in ("Notifier le garage traitement manuel", "répondre infos manquantes", "notifier le garage aucun créneau"):
        wf.node(nm).pop("disabled", None)
    # La réponse automatique respecte l'interrupteur « Automatisation IA » du garage (garages.automatisation_active).
    c = wf.node("Construire le message de relance infos")
    c["parameters"]["jsCode"] = c["parameters"]["jsCode"].replace("garage_email: garage.email || '',", "garage_email: garage.email || '', automatisation_active: garage.automatisation_active === true,")
    assert "automatisation_active" in c["parameters"]["jsCode"]
    wf.node("Réponse envoyable ?")["parameters"]["conditions"]["conditions"].append(cond_true("={{ $json.automatisation_active }}"))
    j = wf.node("Journaliser la réponse non envoyée")["parameters"]["fieldsUi"]["fieldValues"]
    j[-1]["fieldValue"] = "={{ !$json.email ? 'Réponse non envoyée : le client n\\'a pas d\\'adresse e-mail' : !$json.expediteur ? 'Réponse non envoyée : garage introuvable' : 'Réponse non envoyée : l\\'automatisation IA est désactivée pour ce garage (Paramètres)' }}"
    # Anti-boucle : la boîte ignore ses propres notifications ; elles partent maintenant de l'adresse Nexora.
    g = wf.node("Normaliser (Gmail)"); assert 'exp.email === "lkckirua@gmail.com"' in g["parameters"]["jsCode"]
    g["parameters"]["jsCode"] = g["parameters"]["jsCode"].replace('exp.email === "lkckirua@gmail.com"', 'exp.email === "' + NEXORA_FROM + '"')
    # La note d'installation d'origine décrivait l'ancien montage (garage par défaut, adresse perso) : on la remplace.
    note = wf.node("📋 À faire avant utilisation")
    note["parameters"]["content"] = ("## v2 Brevo — ce qui a changé\n"
        "- Plus aucun garage par défaut : un message entrant sans `garage_id` est journalisé dans `actions_ia` (type `entree_sans_garage`) et non traité.\n"
        "- Tous les e-mails partent par l'identifiant `SMTP Brevo — envois métier`, au nom du garage lu en base, Reply-To vers son adresse.\n"
        "- Les notifications internes vont à l'adresse du garage concerné.\n"
        "- La réponse automatique respecte `garages.automatisation_active`.\n"
        "- Accepté / refusé (devis, proposition) : traité par le socle, plus par ici.\n"
        "- Relance entretien : déclencheur désactivé tant qu'il n'existe ni désinscription ni interrupteur par garage.")
    # Le socle traite désormais accepté/refusé : l'assistant ne doit plus jamais le refaire.
    wf.add(sticky("Note v2 - Accepté / refusé", "## Accepté / refusé : traité par le socle\nLe dashboard écrit directement le statut en base ; les triggers `trg_notifier_devis_maj` et `trg_notifier_proposition_maj` créent la notification, que les workflows du socle envoient. Les quatre webhooks qui doublonnaient ont été retirés (rien ne les appelait plus).", [-1400, -700]))
    return wf

def variante_recette(wf):
    wf = WF(wf.d); wf.d["name"] = "RECETTE — Assistant Garage (communications Brevo)"; wf.d["active"] = False
    for n in wf.nodes:
        if "supabaseApi" in (n.get("credentials") or {}): n["credentials"]["supabaseApi"] = dict(CRED_SUPA_TEST)
        if n["type"] == "n8n-nodes-base.webhook": n["parameters"]["path"] = "recette-" + n["parameters"]["path"]
        if n["name"] in ("Email Trigger (IMAP)", "Polling Gmail OAuth (2 min)", "Tous les jours à 9h", "Tous les jours à 18h30"): n["disabled"] = True
    wf.add({"parameters": {}, "id": uid("manual"), "name": "Recette : lancer les tournées", "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": wf.pos("Tous les jours à 9h", 0, -160)})
    wf.set_out("Recette : lancer les tournées", 0, ["RDV entretien terminés", "RDV terminés aujourd'hui"])
    # Les deux instruments ci-dessous n'existent QUE dans la recette : ils rendent pilotables, sans
    # interface, les deux chemins qu'aucun webhook ne couvrait — les tournées et l'entrée e-mail.
    wf.add(webhook_node("Recette : déclencher les tournées", "recette-tournees", wf.pos("Tous les jours à 9h", -220, -160)))
    wf.set_out("Recette : déclencher les tournées", 0, ["RDV entretien terminés", "RDV terminés aujourd'hui"])
    # L'entrée e-mail simulée alimente « Normaliser (Gmail) » : c'est la VRAIE fonction d'extraction
    # du destinataire qui est éprouvée, pas une copie.
    wf.add(webhook_node("Recette : e-mail entrant", "recette-email-entrant", wf.pos("Email Trigger (IMAP)", -220, 0)))
    wf.add(code_node("Recette : message brut", "return [{ json: $input.first().json.body || {} }];",
                     wf.pos("Email Trigger (IMAP)", -110, 0)))
    wf.set_out("Recette : e-mail entrant", 0, ["Recette : message brut"])
    wf.set_out("Recette : message brut", 0, ["Normaliser (Gmail)"])
    gardes = {"répondre infos manquantes": "$json.email", "relance": "$json.client_email",
              "avis google": "$('Récupérer le client (avis)').item.json.email",
              "Notifier le garage traitement manuel": "$json.email",
              "notifier le garage aucun créneau": "$('Récupérer les horaires du garage').first().json.email"}
    preds = wf.preds()
    for cible, expr in gardes.items():
        nom = "Recette : destinataire autorisé ? (" + cible[:22] + ")"
        wf.add(code_node(nom, "const AUTORISEES = " + json.dumps(BOITES_RECETTE) + ";\nconst to = String(" + expr + " || '').trim().toLowerCase();\n"
                         "if (!AUTORISEES.includes(to)) throw new Error('RECETTE : destinataire non autorisé, envoi refusé : ' + to);\nreturn $input.all();", wf.pos(cible, -110, -140)))
        for (src, out) in preds[cible]: wf.insert_between(src, cible, nom, out)
    wf.check(); return wf

def variante_production(wf):
    wf = WF(wf.d); wf.d["name"] = "1 - Assistant Garage Avancé (v2 Brevo)"; wf.d["active"] = False
    for n in wf.nodes:
        if "supabaseApi" in (n.get("credentials") or {}): n["credentials"]["supabaseApi"] = dict(CRED_SUPA_PROD)
    wf.node("Tous les jours à 9h")["disabled"] = True
    wf.add(sticky("Note v2 - Relance", "## Relance entretien : désactivée volontairement\nC'est une sollicitation commerciale, pas une notification de service. Avant de l'activer il faut : (1) un moyen de désinscription enregistré par client, (2) un interrupteur par garage. Le code est prêt et recetté : il recontrôle le rendez-vous à l'instant de l'envoi et part au nom du garage.", wf.pos("Tous les jours à 9h", -40, -260), 560, 220))
    # La demande d'avis est une SOLLICITATION, comme la relance : elle part sans que le client
    # l'ait demandé, et rien ne permet encore d'enregistrer son refus — la mention de retrait
    # arrive chez le garage, personne ne la retient. Elle est donc livrée éteinte, au même titre
    # que la relance. Ce n'est pas un défaut du code : il est recetté et fonctionne.
    wf.node("Tous les jours à 18h30")["disabled"] = True
    wf.add(sticky("Note v2 - Demande d'avis", "## Demande d'avis : désactivée volontairement\nMême raison que la relance : c'est une sollicitation, et `clients` n'a aucune colonne de désinscription. Le message porte une mention de retrait, mais le « stop » d'un client arrive au garage par le Reply-To et n'est enregistré nulle part. À rallumer quand le refus sera enregistrable et respecté.", wf.pos("Tous les jours à 18h30", -40, -260), 560, 220))
    wf.node("Email Trigger (IMAP)")["disabled"] = True
    wf.add(sticky("Note v2 - Boîte IMAP", "## Boîte IMAP : désactivée tant que `gmail_adresse` est vide\nLe repli vers un garage par défaut a été retiré. Le garage est maintenant résolu par le DESTINATAIRE du message (Delivered-To / X-Original-To / To) contre `garages.gmail_adresse`, comme WhatsApp le fait avec `numero_whatsapp`. Sans correspondance : journal `entree_sans_garage`, rien n'est traité.\n\nÀ activer seulement quand (1) au moins un garage a une adresse de réception à lui dans `gmail_adresse`, et (2) cette adresse arrive bien dans la boîte relevée en IMAP avec l'en-tête d'acheminement d'origine. Une boîte unique partagée ne remplit pas (1).", wf.pos("Email Trigger (IMAP)", -40, -260), 560, 220))
    wf.check(); return wf

if __name__ == "__main__":
    base = json.load(open(os.path.join(ICI, "base.json"), encoding="utf-8"))
    commun = transformer(base)
    # Ids de publication : jamais celui d'un workflow qu'on ne veut pas écraser.
    #   - production : id neuf, pour que l'import crée un workflow NEUF à côté du vivant
    #     (`rw69Oin74O5UwQlc`), qu'on suspend ensuite à la main. Porter l'id du vivant
    #     ferait fusionner 117 nœuds dans un workflow actif.
    #   - recette : un id NEUF, pour que la recette s'importe dans une instance à part sans
    #     jamais tomber sur un workflow existant — ni la recette ratée `eX5THd6tZIYBas8n`,
    #     ni la recette précédente `PICszikUjJIpowgJ`.
    for nom, fab, wid in (("recette-test.json", variante_recette, "recetteassistantv2b001"), ("production.json", variante_production, "assistantv2brevo0000001")):
        v = fab(commun); v.check(); v.d["id"] = wid  # id stable : exigé par `n8n import:workflow`
        json.dump(v.d, open(os.path.join(ICI, nom), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"{nom}: {len(v.nodes)} noeuds")

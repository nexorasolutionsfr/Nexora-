# Assistant Garage — communications v2 (Brevo, garage authentique)

Suivi unique des communications de l'ancien Assistant, établi le 10 septembre
2026 à partir de la définition **vivante** dans n8n (`base.json`, 125 nœuds,
aucun secret). Le comptage « neuf e-mails, un migré, six restants » était
faux : voici ce qui existait vraiment.

## Ce que faisaient les neuf envois, avant

| Envoi | Déclencheur | Destinataire | Garage | Transport | État réel avant | Anti-doublon |
|---|---|---|---|---|---|---|
| confirmer devis | webhook `devis-accepte` | client | aucun | Gmail perso | **mort** — plus rien ne l'appelle (0 exécution webhook en 30 j) ; le dashboard écrit le statut en base et le trigger `trg_notifier_devis_maj` fait envoyer le socle | — |
| devis refusé | webhook `devis-refuse` | client | aucun | Gmail perso | **mort**, idem | — |
| confirmer rdv | webhook `proposition-acceptee` | client | aucun | Gmail perso | **mort** et nœud désactivé ; couvert par `trg_notifier_proposition_maj` | — |
| refus proposition | webhook `proposition-refusee` | client | aucun | Gmail perso | **mort** et nœud désactivé | — |
| répondre infos manquantes | message entrant (site, WhatsApp, IMAP) | client | `garage_id` du message, **repli en dur** sur un garage de démo pour l'IMAP | Gmail perso | **nœud désactivé** : n'a jamais envoyé | statut `infos_manquantes` sur la demande |
| Notifier le garage traitement manuel | message entrant non rdv/devis | **boîte fixe du fondateur**, pas le garage | id présent, non utilisé | Gmail perso | **nœud désactivé** | — |
| notifier le garage aucun créneau | demande rdv sans créneau | **boîte fixe du fondateur** | garage lu (horaires) | Gmail perso | **nœud désactivé** | — |
| relance entretien | tous les jours 9 h | client | aucun | Gmail perso | actif mais **dormant** : exige un rendez-vous terminé depuis ≥ 12 mois (aucun n'existe avant août 2027) | `relance_envoyee` posé après envoi |
| avis Google | tous les jours 18 h 30 | client | garage lu | **Brevo** depuis le 9 sept. | actif ; 39 erreurs « No recipients » corrigées le 9 sept. | `avis_demande` posé après envoi |

**Bilan honnête avant cette nuit : aucun e-mail client ne partait plus de
Gmail.** Les quatre webhooks étaient morts, trois nœuds étaient désactivés,
la relance ne peut pas se déclencher avant 2027, et l'avis était déjà migré.
Le risque réel était ailleurs : un **garage par défaut codé en dur** sur
l'entrée IMAP, des notifications internes vers une boîte personnelle, et
quatre branches qui auraient **doublonné le socle** si quelqu'un avait
rebranché le dashboard sur les webhooks.

## Ce que fait la v2 (`construire.py` → `recette-test.json`, `production.json`)

| Envoi | v2 |
|---|---|
| 4 webhooks accepté/refusé | **supprimés** (27 nœuds) — le socle est la seule voie |
| répondre infos manquantes | rallumé ; garage lu en base sur **les deux chemins** (demande créée / mise à jour) ; From « Nom du garage », Reply-To = e-mail du garage ; Brevo ; **soumis à `garages.automatisation_active`** ; sans e-mail client, sans garage ou automatisation coupée → journal `actions_ia` avec motif |
| notifications internes (×2) | rallumées ; envoyées à **l'adresse du garage concerné** depuis « Nexora » ; garage sans adresse → journal |
| relance entretien | recontrôle le rendez-vous **à l'instant de l'envoi** (statut encore `termine`, pas déjà relancé, client avec e-mail, garage trouvé) ; From/Reply-To du garage ; mention pour se désinscrire en répondant ; **déclencheur désactivé en Production** : c'est une sollicitation commerciale et il n'existe ni désinscription enregistrée ni interrupteur par garage |
| avis Google | n'est envoyé que si le client a un e-mail **et** si le garage a renseigné `lien_avis_google` ; sinon journal avec motif et ligne marquée pour ne plus être reprise ; signature au nom du garage ; plus de repli `google.com` |
| entrée IMAP | **plus de garage par défaut** ; un message sans garage est journalisé (`entree_sans_garage`) et non traité ; le déclencheur IMAP est désactivé en Production (boîte partagée = garage inconnu) |
| retour de boucle | défaut préexistant corrigé : le résultat SMTP du dernier envoi revenait dans la file d'entrée comme un faux message |

Aucun e-mail n'a été ajouté au périmètre, aucun destinataire nouveau, aucune
promotion dans un message transactionnel.

## Preuves (recette Test, 10 septembre 2026, 01 h 39 – 02 h 17)

Recette importée **par fichier** (`recette-test.json`, workflow `PICszikUjJIpowgJ`),
identifiants Test, garde-fou qui refuse tout destinataire hors des quatre boîtes
de recette. Deux garages fictifs : SOCLE Garage Alpha (lien d'avis renseigné,
automatisation active) et SOCLE Garage Beta (sans lien d'avis, automatisation
coupée, horaires vides). Le n8n vivant et la Production n'ont rien vu passer.

| Parcours | Événement | Exécution | Résultat vérifié |
|---|---|---|---|
| Réponse infos manquantes | formulaire site, garage Alpha, message vague | 18713, 18776 | e-mail reçu sur `+socle-clientalpha` ; `From: "SOCLE Garage Alpha"`, `Reply-To: +socle-alpha`, DKIM/SPF/DMARC pass, accents corrects, signature au nom du garage |
| Réponse bloquée | même message, garage Beta (automatisation coupée) | 18777 | aucun e-mail ; journal `reponse_non_envoyee` « l'automatisation IA est désactivée pour ce garage » |
| Entrée sans garage | formulaire sans `garage_id` | 18714 | aucun traitement ; journal `entree_sans_garage` |
| Notification interne « traitement manuel » | question de diagnostic, garage Beta | 18725 | e-mail reçu sur `+socle-beta` (l'adresse du garage), depuis « Nexora » |
| Notification interne « aucun créneau » | demande de vidange, garage Beta aux horaires vides | 18720 | e-mail reçu sur `+socle-beta` |
| Relance entretien | 4 rendez-vous terminés depuis 13 mois + 1 annulé | 18790, 18799 | 2 envoyées (Alpha, Beta ; `From` et `Reply-To` du bon garage, mention de désinscription), 2 bloquées « client sans adresse », l'annulé **exclu de la sélection** (18799) après correction du filtre |
| Avis Google | mêmes rendez-vous | 18790, 18799 | envoyé pour Alpha (lien renseigné), bloqué « aucun lien d'avis » pour Beta, bloqué « sans adresse », statut non terminé exclu ; lignes marquées pour ne plus être reprises |
| Lien à jeton ouvert | facture Test `F-2026-0001` | app locale sur Test, port 3111 | page rendue : « SOCLE Garage Alpha — Facture F-2026-0001 — Peugeot 308 — 120,00 € TTC » |

**Ce que la recette a révélé et corrigé en chemin** (les deux sont dans
`construire.py`) :

1. le retour de boucle : après chaque envoi, le résultat SMTP revenait dans la
   file d'entrée et était traité comme un nouveau message ;
2. les deux sélections de rendez-vous combinaient leurs filtres en **OU** — un
   rendez-vous annulé sortait comme « terminé ». En Production, la v2 aurait
   marqué des rendez-vous futurs comme « avis demandé ». Forcé en ET, et le
   statut est revérifié à l'instant de l'envoi.

**Limites de preuve.** La page a été ouverte depuis une application locale
reliée à Test, pas depuis l'extérieur : les préversions Vercel exigent une
connexion. L'IMAP n'a pas été testé (désactivé à dessein). La relance a été
testée sur Test mais est livrée **désactivée** en Production.

## Plan de passage en Production (à ne pas dérouler sans feu vert)

1. **Aucune migration** : ce lot ne touche pas au schéma.
2. Importer `production.json` **inactif** (n8n → Import from File, jamais par
   collage : le collage corrompt les accents). Sélectionner les identifiants
   `Supabase account`, `SMTP Brevo — envois métier`, `Header Auth account`
   (Anthropic) — ils sont référencés par nom, aucun secret dans le fichier.
3. **Suspendre** `1 - Assistant Garage Avancé` (l'ancien). Attendre 5 min.
   Les chemins de webhook `demande-site` / `demande-whatsapp` ne peuvent
   exister que sur un seul workflow actif : l'ancien doit être arrêté
   **avant** d'activer la v2.
4. Files existantes : l'Assistant n'a pas de file propre. Vérifier seulement
   qu'aucun rendez-vous de démo n'a `avis_demande = false` avec un client
   réel (sinon l'avis partirait le soir même) — au 10 septembre, Production
   n'en a aucun.
5. **Activer** la v2. Critères : une exécution `success` sur le webhook
   `demande-site` de recette n'est pas possible en Production — on vérifie
   plutôt : 18 h 30 → exécution avis `success`, journal `actions_ia`
   cohérent, zéro e-mail inattendu. Suspendre à la première erreur.
6. Ne pas activer « Tous les jours à 9h » ni « Email Trigger (IMAP) » : ils
   sont livrés désactivés à dessein.

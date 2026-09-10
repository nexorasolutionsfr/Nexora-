# Suspendre l'entrée IMAP et la demande d'avis — procédure prête

Préparé le 10 septembre 2026. **Non exécuté** : la session n8n est fermée et
la saisie d'un mot de passe est hors de mon périmètre. Une fois reconnecté,
c'est l'affaire de quelques minutes.

## Sauvegarde préalable — déjà faite

**Définition** : la définition publiée de `1 - Assistant Garage Avancé`
(`rw69Oin74O5UwQlc`, 125 nœuds) est **identique au bit près** à
`n8n/assistant-garage/base.json`, déjà versionné dans cette branche.
Empreintes vérifiées le 10 septembre : nœuds `56dbdb292c12`, connexions
`0c92425cb079`. Il n'y a rien de plus à sauvegarder.

**État publié au moment de la sauvegarde** — `active = true` :

| Nœud | Type | État |
|---|---|---|
| 🌐 Nouvelle demande (Site web) | webhook | activé |
| 💬 Nouveau message (WhatsApp) | webhook | activé |
| Webhook - Devis accepté / refusé | webhook | activé |
| Webhook - Proposition acceptée / refusée | webhook | activé |
| Tous les jours à 9h | cron | activé |
| **Tous les jours à 18h30** | cron | **activé ← à suspendre** |
| **Email Trigger (IMAP)** | imap | **activé ← à suspendre** |
| Polling Gmail OAuth (2 min) | cron | désactivé |
| confirmer devis · devis refusé · relance · avis google | envoi | activés |
| répondre infos manquantes · confirmer rdv · refus proposition · les 2 notifications internes | envoi | désactivés |

Pour revenir en arrière : réactiver les deux nœuds et republier. L'état
ci-dessus est la référence.

## Deux mécanismes officiels, dont un sans mot de passe

n8n 2.37 expose en ligne de commande, **dans le conteneur**, les commandes de
publication — elles ne demandent aucune session web :

```
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:$PATH"
docker exec nexora-n8n n8n --help          # publish:workflow, unpublish:workflow, import:workflow
```

`import:workflow` porte un indicateur qui compte : `--activeState`, dont le
défaut **désactive tout workflow importé**. Pour conserver l'état d'origine il
faut `--activeState=fromJson`. (C'est ce qui explique le « 7 actifs → 0 après
import » observé pendant la répétition d'hébergement.)

**Ces commandes écrivent dans l'instance vivante : elles demandent ton accord
explicite.** Elles m'ont été refusées par le garde-fou de permissions, et je
n'ai rien tenté de contourner. L'instance est intacte : 19 workflows,
7 actifs, `rw69Oin74O5UwQlc` toujours à 125 nœuds (vérifié après le refus).

### Une inconnue à lever avant d'employer la voie ciblée

La sémantique de `import:workflow` sur un identifiant **déjà existant** n'est
pas établie : remplace-t-il la définition, ou **ajoute**-t-il les nœuds comme
le fait l'import par l'interface ? C'est cette seconde sémantique qui a
produit les 361 nœuds le 9 septembre. Test sans risque proposé, sur le
workflow qu'on jette de toute façon :

```
# 1. sauvegarder la base (copie simple, le conteneur peut rester en marche)
cp ~/Nexora/n8n_data/database.sqlite ~/Nexora/n8n_data/database.sqlite.avant-$(date +%F_%H%M)

# 2. importer la recette sous l'identifiant du workflow raté
#    (fichier à fabriquer depuis recette-test.json en changeant seulement "id")
docker cp /tmp/test-semantique.json nexora-n8n:/tmp/test-semantique.json
docker exec nexora-n8n n8n import:workflow --input=/tmp/test-semantique.json
```

Si `eX5THd6tZIYBas8n` passe de 361 à **124** nœuds : la commande **remplace**,
la voie ciblée est sûre. S'il passe à 485 : elle **ajoute**, et il faut s'en
tenir à la voie de repli. Dans les deux cas ce workflow est jetable, et ses
exécutions — qui portent quatre preuves de recette — ne sont pas touchées par
un changement de définition.

## Voie préférée — suspension ciblée (2 nœuds)

### Par la ligne de commande, si le test ci-dessus dit « remplace »

```
docker exec nexora-n8n n8n export:workflow --id=rw69Oin74O5UwQlc --output=/tmp/assistant.json
# désactiver UNIQUEMENT « Email Trigger (IMAP) » et « Tous les jours à 18h30 »
# (ajouter "disabled": true à ces deux nœuds), garder "active": true
docker exec nexora-n8n n8n import:workflow --input=/tmp/assistant-modifie.json --activeState=fromJson
docker exec nexora-n8n n8n publish:workflow --id=rw69Oin74O5UwQlc
```

La dernière ligne est **indispensable** : sans elle on n'a modifié qu'une
version non publiée, et l'ancienne continue de tourner.

### Par l'interface

1. Ouvrir `1 - Assistant Garage Avancé`.
2. Désactiver **`Email Trigger (IMAP)`** (clic droit → Deactivate).
3. Désactiver **`Tous les jours à 18h30`**.
4. **Publier.** C'est l'étape qui compte : en n8n 2.x, modifier le canevas
   crée un **brouillon**. Tant que la version publiée n'est pas remplacée,
   l'ancienne continue de tourner. Vérifier que le bandeau ne dit plus qu'il
   existe des modifications non publiées.
5. **Ne pas** désactiver le workflow entier à cette étape, et **ne toucher à
   aucun** des quatre workflows du socle.

### Contrôles après publication

- La version publiée porte bien les deux nœuds désactivés (rouvrir le
  workflow après rechargement de la page, pas seulement le canevas en cours).
- Aucune nouvelle exécution IMAP ne démarre : la prochaine arrivée de courrier
  dans la boîte partagée ne doit produire aucune exécution.
- À 18 h 30, **aucune exécution** de la tournée d'avis.
- Exécutions en cours au moment de la suspension : en relever la liste
  (Executions → Running). Au 10 septembre 08 h 41, il n'y en avait aucune —
  les 8 exécutions IMAP datent du 8 septembre et sont terminées.

## Voie de repli — dépublier l'Assistant entier

À n'employer que si la suspension ciblée est impossible. **Coût mesuré**, sur
l'historique conservé par n8n (6 → 10 septembre, la purge est réglée à
7 jours) :

| Ce qui s'arrête | Exécutions sur la fenêtre observée |
|---|---|
| Entrée IMAP | 8 — **c'est le défaut qu'on veut arrêter** |
| Tournée d'avis 18 h 30 | 3 (toutes en erreur « No recipients ») |
| Tournée de relance 9 h | 2 (aucun envoi : rien n'est éligible avant août 2027) |
| Webhooks `demande-site` et `demande-whatsapp` | **0** |
| Webhooks accepté/refusé (×4) | **0** — traités par le socle depuis le 9 sept. |

**Les 49 exécutions conservées sont toutes en mode `trigger` : aucune
exécution de webhook, sur toute la fenêtre.** Deux signaux indépendants
convergent : aucun appel observé, et aucune occurrence des chemins
`demande-site` / `demande-whatsapp` dans le code du dashboard.

Réserve honnête : ces webhooks sont appelés de l'**extérieur** (formulaire du
site, Twilio). L'absence d'appel sur quatre jours prouve qu'ils ne servent pas
aujourd'hui ; elle ne prouve pas qu'ils ne serviront jamais. Si la voie de
repli est employée, c'est la seule fonction réellement interrompue.

**Dans les deux cas : ne pas toucher à Facture, Proposition RDV, Nouveau devis
et Véhicule prêt.** Ils tournent (≈ 400 exécutions chacun sur 7 jours,
dernière à 06 h 40 le 10 septembre) et portent tous les envois réels.

## Ne pas faire

- **Ne pas éditer la base n8n directement.** `~/Nexora/n8n_data/database.sqlite`
  est ouverte par le conteneur ; y écrire derrière son dos corromprait l'état
  en mémoire. Tout passe par l'interface.
- Ne pas supprimer l'ancien Assistant : c'est le retour arrière de la v2.

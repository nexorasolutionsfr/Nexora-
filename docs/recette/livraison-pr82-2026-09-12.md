# Livraison de la PR #82 — 12 septembre 2026

Ce qui a été publié cette nuit, ce qui a été vérifié et comment, ce qui reste
ouvert. Écrit pour qu'on puisse refaire les contrôles sans rien deviner.

## Publié

| | |
|---|---|
| Commit de fusion sur `main` | `6968684` |
| Déploiement Vercel Production | `6968684`, succès à 00:45:34Z |
| Dernier commit de la branche | `b9bdd08` |

La PR a été fusionnée par un commit de fusion, comme les précédentes (#80,
#81). La prévisualisation Vercel de `b9bdd08` était verte avant la fusion.

### Migrations appliquées en Production

Avant écriture : cible confirmée (`omphppsmhmyllapdqevn`, « Nexora Garage
Core »), historique relu — la dernière version enregistrée était bien
`20260915000100` —, définitions de `reserver_notifications` et
`apercu_message_devis` sauvegardées, et `supabase db push --dry-run` ne
proposant que les deux migrations attendues, rien d'autre.

| Version | Effet |
|---|---|
| `20260915000200` | la mise à l'écart d'un document modifié reste bornée aux garages demandés |
| `20260915000300` | l'aperçu montré au garage dit exactement le message envoyé |

Après application, les empreintes des deux fonctions sont identiques sur Test
et sur Production, et les trois versions du 15 figurent dans les deux
historiques. Les files de Production étaient et restent à **0 en attente,
0 en cours** (3 bloquées, 23 envoyées côté devis ; 1 envoyée côté factures —
toutes antérieures).

Les six workflows n8n actifs pointent vers la Production ; aucun ne lit Test.
Aucun n'a été activé, désactivé ni modifié.

## Vérifié, et comment

Les écrans ont été parcourus sur **Test** (`http://localhost:3111`), qui sert
le code fusionné, avec les comptes synthétiques du garage
« Garage Recette Dix Minutes Apres ». La Production n'héberge aucun garage
synthétique et sa clé de service n'est pas sur le Mac : on n'y a donc pas
ouvert de session — le compte du pilote n'a pas été touché.

| Contrôle | Résultat |
|---|---|
| Le code déployé porte bien la livraison | la phrase « Vos devis, de la création à la réponse du client », écrite cette nuit, est présente dans le bundle servi par `nexora-garage.vercel.app` |
| Création client + véhicule en une fenêtre | « Client et véhicule enregistrés », Renault Clio `CTRL-912-LV` rattachée au client créé |
| Un devis créé n'autorise pas son envoi | en base : `statut = sans_lien`, ni jeton, ni empreinte, ni destinataire. À l'écran : « Rien n'est parti. Relisez le message, puis confirmez l'envoi. » |
| Aperçu client | « Ce que verra le client » affiche la page publique telle quelle : garage, véhicule, 96,00 € |
| Geste d'envoi | « Envoyer au client par e-mail… » ouvre la relecture (destinataire, objet, message, lien en pointillés) puis demande « Oui, envoyer ce message ». Annulé : la ligne est restée `sans_lien` |
| Message aligné | l'aperçu dit « pour votre Renault Clio (CTRL-912-LV) : 96.00 € », la forme que compose le traitement n8n |
| Réponse du client retrouvable | « Devis accepté par Client Recette Envoi — reçu à l'instant » sur l'accueil et dans l'onglet Devis |
| Rôle accueil | menu à 7 entrées, sans Factures, Historique, Statistiques ni Paramètres ; la page Devis s'ouvre sans refus, sans onglets Factures/Historique ; sous-titre et raccourci ne nomment plus la facturation |
| Alertes découvrables | zéro alerte au chargement → l'entrée « Notifications à vérifier » est absente ; une alerte apparue ensuite fait revenir l'entrée **au changement d'écran**, sans recharger la page. La donnée d'essai a été remise dans son état antérieur |
| Tests | 282 JavaScript et 29 TypeScript verts sur le commit final |

### Ce qui n'a pas été vérifié

- **Aucun envoi réel cette nuit.** La chaîne complète avait été prouvée le
  12 septembre à 00:04 (envoi Brevo, réception, ouverture du lien,
  acceptation). Cette preuve reste valable pour le transport, mais la
  réservation et la clôture avaient alors été orchestrées à la main : ce n'est
  **pas** une preuve que toute la chaîne n8n fonctionne seule.
- **Aucun écran ouvert en Production.** Voir plus haut.
- **L'inscription depuis le site public** reste à faire par Baptiste.
- Le mode Cockpit reste éteint des deux côtés : les écrans jugés sont ceux de
  la variante en trois zones.

## Reste ouvert

1. **La facture garde le défaut du devis** : sa notification est armée dès la
   génération. Correctif minimal : la même migration que pour le devis
   (`notifier_nouvelle_facture` → `sans_lien`) **et** un geste d'autorisation
   dans l'écran Factures, qui n'existe pas encore. Hors périmètre de cette
   livraison. Tant qu'il est ouvert, on ne peut pas dire que les envois sont
   entièrement sécurisés.
2. **Deux sources pour un même message** : l'aperçu vient de
   `apercu_message_devis`, le texte envoyé est reconstruit dans un nœud de code
   n8n. Alignés mot pour mot, sans garantie qu'ils le restent.
3. **Workflow de recette à supprimer d'un clic** :
   « RECETTE TEST — envoi devis (exécution ponctuelle) »,
   `recetteenvoitest00000001`, inactif, créé le 12 septembre à 00:02:59Z. La
   CLI de cette version de n8n ne sait ni supprimer ni archiver.
4. **Rôle accueil et alertes** : l'accueil a le droit `verifier` mais aucune
   entrée de menu n'y mène. Question de produit, pas défaut de droits.

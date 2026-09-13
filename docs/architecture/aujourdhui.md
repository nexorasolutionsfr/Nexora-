# L'écran Aujourd'hui

13 septembre 2026. La direction à deux colonnes a été validée sur prototype,
puis **intégrée au tableau de bord**. Ce document décrit l'écran réel.

> Le prototype (`/prototype/aujourdhui`, `AujourdhuiPrototype.jsx`,
> `donneesPrototype.js`) et ses commandes de scénario ont été **supprimés**
> avec l'intégration. Un prototype qui survit à sa livraison devient une
> seconde vérité, et c'est celle-là qu'on finit par corriger.

## L'ouvrir

Depuis le dossier du worktree
`~/Documents/Codex/2026-08-27/files-mentioned-by-the-user-tu/nexora-atelier-continuite` :

```bash
npx --yes pnpm@10.34.5 dev --port 3113
```

Puis : **http://localhost:3113/dashboard** — c'est le premier écran, il n'y a
rien d'autre à ouvrir.

Si la page reste blanche après un changement de branche, vider le cache de
développement : `rm -rf .next` puis relancer. C'est ce qui a provoqué le
« connexion refusée » de la revue — un cache Turbopack resté sur une version
précédente du tableau de bord.

Pour éprouver les quatre situations, il faut de vraies données : quatre
garages de recette sur Test, créés par
`node scripts/recette/jeu-atelier.mjs creer` (journée habituelle) et
`node scripts/recette/jeu-aujourdhui.mjs creer` (chargée, vide, nouveau).

## Ce qu'il réutilise, et pourquoi c'est le point

- `filVehicule` — l'état, la prochaine action, qui doit agir, le libellé du
  bouton ;
- `components/aujourdhui/priorites.js` — l'ordre et la raison (26 tests) ;
- `regrouperOperationnel` — le résumé des quatre files de l'atelier.

**Aucune règle métier n'est réécrite dans la maquette.** Une maquette qui
recalculerait ses propres états montrerait ce qu'on veut voir, pas ce que le
produit sait faire. Les données sont fictives ; les décisions affichées sont
celles du vrai code.

## La structure

Le prototype est montré **dans le cadre du tableau de bord** — barre latérale
et recherche. Un écran jugé hors de son cadre se juge mal : la largeur
disponible et la place de la recherche en dépendent.

La **barre violette** en haut et les **notes de conception** repliées en bas
sont des **outils de revue**. Elles sont signalées comme telles et
n'appartiennent pas à l'interface destinée au garage.

| Zone | Contenu |
|---|---|
| En-tête | « Aujourd'hui », la date, la recherche globale existante |
| Situation | Une phrase : **présentes au garage**, **attendues**, décisions en attente |
| **Colonne principale** | **À faire maintenant** : véhicule, **raison de la priorité**, une action nommée |
| **Colonne secondaire** (320–360 px) | Arrivées attendues · Voitures prêtes · Argent à risque · Atelier |

Sur téléphone : **une seule colonne, les priorités en premier**.

## Les textes ne disent que ce qui est vérifiable

| Avant | Après | Pourquoi |
|---|---|---|
| « Prête, et le client ne le sait pas encore » | « Notification de disponibilité non envoyée » | Nexora sait ce qu'il a envoyé. Il ne sait pas ce que le client sait. |
| « client prévenu » | « Notification envoyée » | C'est la seule preuve disponible : un message est parti, pas qu'il a été lu. |
| « L'atelier et l'ordre de réparation se contredisent » | « L'ordre de réparation est terminé, mais la voiture est encore notée "à venir" à l'atelier. Mettez l'atelier à jour. » | La contradiction exacte et le geste. La formule générique obligeait à ouvrir le dossier pour savoir laquelle des deux corriger. |
| « 13 voitures au garage » | « 9 voitures au garage, 4 attendues » | « Au garage » comptait les voitures pas encore arrivées. |
| « Créneau de 07:00 dépassé » | « Travaux prévus jusqu'à 09:00, dépassés » | Une heure d'arrivée dépassée ne prouve rien sur l'avancement des travaux. |

### Les six états d'une notification

`aucune`/`a_valider` → **non envoyée** · `en_attente_envoi` → **en attente** ·
`envoi_en_cours` → **à vérifier** · `envoye` → **envoyée** · `bloque` →
**bloquée**.

Et le sixième, qui n'en est pas un : **inconnu**. Quand `etat_envoi_atelier`
n'a pas répondu, l'écran écrit « inconnu » — **jamais « non envoyée »**.
Conclure qu'un client n'a pas été prévenu sans l'avoir vérifié serait une
affirmation gratuite sur une personne. Un test fige cette règle.

## L'ordre des priorités, et pourquoi il est explicable

| Rang | Raison | Urgent |
|---|---|---|
| 0 | L'atelier et l'ordre de réparation se contredisent | **oui** |
| 1 | Prête, et le client ne le sait pas encore | **oui** |
| 2 | Attendue à HH:MM, pas encore arrivée | non |
| 3 | Créneau de HH:MM dépassé | non |
| 4 | Document établi, pas encore envoyé | non |
| 5 | La phrase du fil, telle quelle | non |

À raison égale, la voiture attendue le plus tôt passe devant. **Rien d'autre.**
Un tri qu'on ne peut pas expliquer en une phrase ne sera pas cru.

**La limite est une commodité de lecture, pas un filtre.** Quatre lignes sont
montrées, mais **toute priorité urgente reste visible**, même s'il y en a huit.
Une urgence cachée derrière « Voir toutes » est une urgence découverte trop
tard. Un test fige cette règle.

### Ce qui ne remonte PAS, et pourquoi

Constaté sur la journée chargée : **13 voitures sur 13** remontaient d'abord.
`filVehicule` dit « à vous de jouer » pour toute voiture en cours de travail ou
en attente d'une pièce — c'est juste, mais ce n'est pas une décision à prendre :
c'est du travail en cours, et sa place est dans l'Atelier. Après correction :
**10 sur 13**, dont 4 urgentes. Une liste qui contient tout ne hiérarchise rien.

## Arrivées ≠ restitutions

Une arrivée a une heure : `rendez_vous.date_debut` est bien l'heure à laquelle
on attend la voiture. **Une restitution n'en a pas** : Nexora ne porte aucune
heure de restitution, et `date_debut` sur une voiture prête est l'heure du
matin où elle est arrivée.

L'écran le dit en toutes lettres — « Aucune heure de restitution n'est prévue
dans Nexora » — plutôt que d'afficher une heure qui laisserait croire à un
rendez-vous. C'est aussi ce qui empêche de réintroduire le défaut corrigé dans
l'Atelier le même jour (« Créneau de 08:00 dépassé » sur une voiture prête).

**Décision produit ouverte** : faut-il une heure de restitution convenue ? Elle
demanderait une colonne, donc une migration.

## Ce qui a été retiré — et où ça vit vraiment

**Vérifié dans le code, pas supposé.** Une intention de déplacement ne suffit
pas : chaque ligne ci-dessous a été contrôlée.

| Retiré | Où le retrouver | Vérification |
|---|---|---|
| « Bonjour {garage} » | nulle part | le garagiste sait qui il est |
| Les quatre grandes cartes de compteurs | le résumé **Atelier**, colonne de droite | les quatre files y sont, cliquables |
| Les raccourcis (Agenda, Clients…) | la **barre latérale** | les neuf entrées de `navGroups` y sont, toutes cliquables |
| Les explications permanentes sur les envois | **l'écran d'envoi** | `EnvoiDocument` affiche `etat.titre` et `etat.detail` au moment d'envoyer |
| Les indicateurs financiers | **Statistiques** | `StatistiquesView` calcule CA du mois, évolution, panier moyen, CA par prestation |
| La carte « Mettez votre garage en route » | une ligne discrète en bas | nomme ce qu'elle débloque |

### L'exception : « Argent à risque » ne bouge pas

Je l'avais annoncé « → Statistiques ». **C'était faux.** Vérification faite :
cette zone est bâtie sur `travaux_differes` et les clients fidèles dormants, et
**aucun autre écran ne les montre** — `onOuvrirTravailDiffereModal` n'est passé
qu'à l'écran Aujourd'hui.

La retirer ne la déplacerait pas : elle la **supprimerait**. Elle reste donc,
réduite à une ligne — le montant sans le pavé.

**Décision à prendre** : lui faire un écran, ou la garder ici.

## Deux vides, deux écrans

Un garage qui démarre et un garage qui n'a rien aujourd'hui ne se ressemblent
pas. Les confondre, c'est parler de « votre première voiture » à un garage qui
en répare depuis trois ans.

| Situation | Ce que dit l'écran |
|---|---|
| **Nouveau garage** (aucun client, aucun véhicule) | « Votre garage est prêt. Il n'y a encore aucun client ni véhicule enregistré. » → **Ajouter un client** ou **Importer mon fichier** — les deux chemins qui existent déjà |
| **Garage actif, journée vide** | « Rien de prévu aujourd'hui. » → **Ouvrir l'agenda**. Jamais « première voiture » |

**Un réglage qui bloque une action précise** est signalé là où il bloque, et
nomme ce qu'il débloque : « Vos horaires ne sont pas renseignés : l'agenda
proposera des créneaux les jours de fermeture. »

## Style

Moins de cartes emboîtées, pas d'ombre portée, pas de grand aplat marine. Des
lignes alignées séparées par un filet, des titres de section en petites
capitales espacées, la plaque en gras tabulaire, le secondaire en gris. Le bleu
Nexora reste l'accent, et il ne sert qu'aux actions.

## Ce que l'écran fait, et ce qu'il ne fait pas

- **Chaque bouton exécute la vraie action**, en gardant le véhicule et
  l'intervention : ouvrir le dossier, aller dans l'Atelier, ouvrir la fiche
  atelier sur le bon véhicule, ouvrir le rendez-vous, ou ouvrir l'aperçu de
  « Prévenir le client ».
- **Il ne décide rien.** L'autorisation d'un envoi passe par
  `autoriser_envoi_atelier`, et par elle seule. L'écran montre l'aperçu, le
  destinataire, et — si l'envoi est bloqué — **depuis quand et pourquoi**,
  avant toute revalidation.
- **Il ne réécrit aucun état pour faire propre.** Les voitures prêtes depuis
  longtemps et leurs notifications bloquées restent affichées telles quelles.

### Une erreur ne ressemble jamais à une journée vide

Si les données ne se lisent pas, l'écran ne montre pas un cadre vide : il
affiche un bloc rouge, « Impossible de charger votre journée — ce n'est pas une
journée vide », et un bouton **Recharger**. Un garagiste qui voit un écran vide
en conclut qu'il n'a rien à faire ; c'est la pire réponse possible à une panne
de lecture.

Vérifié en coupant réellement la requête (`BLOQUER_URL` de
`scripts/recette/capture.mjs`) :
`docs/recette/captures/APRES4-aujourdhui-erreur-chargement.png`.

## Les destinations, vérifiées une par une

Cliquées dans le tableau de bord réel, sur Test : ouvrir le dossier depuis une
arrivée et revenir à la liste, ouvrir l'aperçu de « Prévenir le client »,
revalider un envoi bloqué (motif et date affichés avant), chercher une facture
par son numéro, « Voir dans l'Atelier » et le retour.

Captures : `docs/recette/captures/APRES4-aujourdhui-*.png`.

## Une seule lecture de chaque fait

La page portait deux comptages de l'atelier. Celui de « Votre journée »
limitait « prêt » et « restitué » aux rendez-vous du jour, et annonçait donc
**0 prêt** quand le résumé d'à côté en comptait **2**. Le bloc est supprimé :
le résumé Atelier d'Aujourd'hui est le seul, et il compte les quatre files
comme l'écran Atelier les affiche.

Même règle pour le reste de la page :

| Ce qui est affiché | Où il vit, et une seule fois |
|---|---|
| progression de l'atelier, prochains rendez-vous | résumé **Atelier** et **Arrivées attendues**, en haut |
| demandes, devis à traiter, prêt à valider | **sous les priorités**, dans la colonne de travail |
| devis en attente | « Prêt à valider » — la pastille « Nexora a repéré » s'efface quand le bloc les liste |
| chiffre d'affaires du mois | **une ligne** qui mène à Statistiques |
| visite restituée depuis plus de 7 jours | **Facturation**, « RDV terminés à facturer » — sans limite de date |
| travaux différés, appels à rappeler | « Argent à risque » et les deux gestes d'ajout, qui n'existent nulle part ailleurs |

Et le résumé compte des **actions**, pas des voitures : « 9 actions vous
attendent », avec « sur N voitures » dès que les deux chiffres diffèrent.

## Les rôles

| Rôle | Ce qu'il voit |
|---|---|
| dirigeant | l'écran complet |
| accueil | le même écran ; Statistiques et Paramètres restent hors de son menu |
| mecanicien | **n'atteint jamais Aujourd'hui** — son écran est « Mon atelier », sans prix ni contact client |

## Ce qu'il reste à trancher

1. La limite de 4 priorités : le bon chiffre ? (aucun réglage utilisateur,
   volontairement)
2. « Prête, et le client ne le sait pas encore » appelle `etat_envoi_atelier`
   pour chaque voiture prête — une requête par voiture, comme l'Atelier le
   fait déjà. Acceptable, ou à regrouper ?
3. Faut-il une heure de restitution convenue (colonne + migration) ? Pour
   l'instant l'écran dit franchement qu'il n'en a pas.
4. « Argent à risque » : un écran à lui, ou il reste sur Aujourd'hui ?

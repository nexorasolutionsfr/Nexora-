# Recette — le nouvel Aujourd'hui, dans le tableau de bord réel

13 septembre 2026. Projet **Test** (`slawilafseganlbghgwx`), serveur local
`http://localhost:3113/dashboard`. **Aucun envoi réel.** Toutes les adresses
client sont en `.invalid` : le domaine n'existe pas par norme (RFC 2606), donc
aucun message ne peut atteindre qui que ce soit, même par accident.

> Ce n'est pas une recette de tests unitaires. Les 448 tests passent et la
> compilation aussi, mais ce qui suit a été **cliqué dans le navigateur**, sur
> de vraies données, sous de vraies sessions.

## Les quatre garages de recette

| Situation | Garage | Contenu |
|---|---|---|
| journée habituelle | `76147ea8-4071-4bf5-a135-969324c24c13` | 15 rendez-vous, 2 voitures prêtes dont une notification bloquée |
| journée chargée | `f2681b96-6886-44a7-aa97-f86904046438` | 14 rendez-vous du jour, toutes les étapes, un client sans adresse |
| journée vide | `e9ce923b-3f5a-4189-8108-6b2eb17f6ff5` | 2 clients, 2 voitures, un passé — mais rien aujourd'hui |
| nouveau garage | `7a02c1d3-56b7-4deb-b98a-671165dbc415` | rien du tout |

Rejouables : `node scripts/recette/jeu-aujourdhui.mjs creer` (les trois
derniers), `node scripts/recette/jeu-atelier.mjs creer` (le premier).

## Avant / après, sur les mêmes garages

L'« avant » est l'état publié (`origin/main`), servi depuis un second worktree
sur le port 3114, avec les mêmes comptes et les mêmes données. Deux écrans, un
seul jeu de faits.

| | Avant (`origin/main`) | Après |
|---|---|---|
| journée habituelle, bureau | `AVANT4-aujourdhui-habituelle-bureau.png` | `APRES4-aujourdhui-habituelle-bureau.png` |
| journée habituelle, téléphone | `AVANT4-aujourdhui-habituelle-mobile.png` | `APRES4-aujourdhui-habituelle-mobile.png` |
| journée vide | — (l'écran d'avant ne distinguait pas les deux vides) | `APRES4-aujourdhui-vide-bureau.png` |
| nouveau garage | — (idem) | `APRES4-aujourdhui-nouveau-bureau.png` |

Ce que l'avant montrait en premier : un bandeau « Bonjour, <nom du garage> », la
date, quatre compteurs, puis « Mettez votre garage en route ». La première
décision du jour arrivait après trois cadres. Les voitures prêtes, les arrivées
attendues et la notification bloquée depuis le 23 août **n'apparaissaient nulle
part**.

Les deux écrans ne comptent pas pareil, et c'est voulu : l'avant annonçait
« 3 voitures attendues, 5 à l'atelier », l'après « 7 voitures au garage, 4
attendues ». Le nouveau sépare ce qui est là de ce qui est seulement prévu — un
garagiste qui compte ses places s'en serait aperçu avant nous.

## Les quatre situations, bureau et téléphone

| Situation | Bureau (1280×900) | Téléphone (375×812) |
|---|---|---|
| habituelle | `APRES4-aujourdhui-habituelle-bureau.png` | `APRES4-aujourdhui-habituelle-mobile.png` |
| chargée | `APRES4-aujourdhui-chargee-bureau.png` | `APRES4-aujourdhui-chargee-mobile.png` |
| vide | `APRES4-aujourdhui-vide-bureau.png` | `APRES4-aujourdhui-vide-mobile.png` |
| nouveau garage | `APRES4-aujourdhui-nouveau-bureau.png` | `APRES4-aujourdhui-nouveau-mobile.png` |

Toutes ces captures sont des **pages entières**, pas des écrans : c'est la page complète qui devait redevenir cohérente.

Ce qui s'y vérifie :

- **Deux colonnes sur bureau** — priorités à gauche, arrivées et voitures
  prêtes à droite, résumé Atelier dessous. **Une seule colonne à 375 px**,
  priorités d'abord.
- **Quatre priorités visibles, un total, « Voir toutes »** : 11 sur la journée
  habituelle, 9 sur la chargée. Aucun réglage utilisateur.
- **Deux vides distincts.** Journée vide : « Rien de prévu aujourd'hui —
  aucune voiture attendue, aucune à l'atelier. Les rendez-vous des prochains
  jours sont dans l'Agenda », avec **Ouvrir l'agenda**. Nouveau garage :
  « Commencez par vos clients », avec **Ajouter un client** et **Importer mon
  fichier**. Un garage qui n'a pas encore de clients n'a pas besoin qu'on lui
  parle d'agenda.
- **La recherche est conservée**, en haut, et elle trouve les factures.
- **Les travaux différés restent accessibles** : la ligne « Argent à risque »
  et « Ajouter un travail à relancer » sont sur la page.
- **Le comptage ne ment pas** : « 7 voitures au garage, 4 attendues » — les
  attendues ne sont pas comptées comme présentes.

## La consolidation du 13 septembre (soir)

La revue de la page entière a trouvé ce que les captures d'écran cadrées ne
montraient pas : **le nouvel Aujourd'hui était empilé au-dessus d'une grande
partie de l'ancien**, et les deux ne disaient pas la même chose.

| Constat | Correction |
|---|---|
| « Votre journée » affichait **0 PRÊT** pendant que le résumé Atelier, dix centimètres plus haut, comptait **Prêtes 2**. `calculerProgressionAtelier` limitait « prêt » et « restitué » aux rendez-vous DU JOUR : une voiture déposée hier et prête ce matin n'y figurait pas. | Le bloc est **supprimé**. Sa progression d'atelier, ses prochains rendez-vous et son alerte « en attente client ou pièce » sont tous dans le résumé Atelier et les arrivées. Un seul comptage reste. |
| « Demandes et devis à traiter » et « Prêt à valider » vivaient tout en bas, après trois autres cadres. | Ils remontent **sous les priorités, dans la colonne large** — là où l'écran de bureau laissait du vide. Mêmes lignes, mêmes actions. |
| « Nexora a repéré · **2 devis en attente** » annonçait exactement les deux lignes de « Prêt à valider », trois cadres plus bas. On pouvait croire à quatre devis. | Les pastilles ne gardent que ce qui n'a **pas d'autre présence** sur la page. |
| « Ce mois-ci » répétait trois chiffres qu'on retrouve dans Statistiques. | Réduit à **une ligne** qui mène au détail. Rien n'est perdu. |
| **La Clio BB-202-BB comptait trois lignes**, dont deux mot pour mot identiques : « Générez la facture depuis l'écran Facturation. » | Dédoublonnage sur l'**identifiant de l'action**, et date de la visite sur les lignes jumelles — voir ci-dessous. |
| « **11 demandent une décision de votre part** » se lisait comme onze voitures. | La phrase dit maintenant **« 11 actions vous attendent, sur 9 voitures »**, et se réduit à « N actions vous attendent » quand les deux chiffres coïncident. |

### Deux corrections de la revue de code, avant publication

La première version de ces gardes en faisait trop. Relu au SHA `38fb8bb`, puis
corrigé :

**1. Une action nécessaire ne se périme pas.** Une fenêtre de sept jours
écartait les visites closes. Elle mesurait `date_debut` — l'heure du
RENDEZ-VOUS, pas celle de la restitution : une voiture entrée il y a quinze
jours et rendue ce matin en sortait, **le jour même où sa facture devenait à
faire**. Et au fond, une facture qui reste à établir reste à établir : l'âge du
rendez-vous ne la rend pas faite. **La fenêtre est retirée.** La longueur de la
liste se maîtrise par la limite d'affichage et « Voir toutes », qui masquent
sans rien effacer.

**2. Deux interventions distinctes restent deux actions.** Le dédoublonnage
groupait sur `vehicule_id + raison + texte` : deux rendez-vous à facturer de la
même voiture devenaient une seule ligne, et la seconde facture n'était plus
réclamée nulle part. Masquer une tâche est pire que la répéter.

Le dédoublonnage porte désormais sur ce qui porte l'action, par son
identifiant stable :

| Type de ligne | Identité |
|---|---|
| relance d'un document | l'**id du devis ou de la facture** — un même devis est rattaché à plusieurs rendez-vous du véhicule (`devisList.find` apparie par `vehicule_id`), c'est **une** relance |
| tout le reste | l'**id de l'intervention** — deux interventions, deux actions |

Et deux lignes jumelles **restent distinguables** : la date de leur visite
s'ajoute, uniquement sur celles qui partagent voiture et libellé.

> BB-202-BB · Renault Clio IV · Étienne Vasseur
> Générez la facture depuis l'écran Facturation. · **Visite du 17 mars**
>
> BB-202-BB · Renault Clio IV · Étienne Vasseur
> Générez la facture depuis l'écran Facturation. · **Visite du 30 juillet**

Capture : `APRES5-aujourdhui-deux-interventions-distinctes.png`.

Trois tests couvrent exactement ces cas (`priorites.test.js`) : un rendez-vous
commencé il y a quinze jours et restitué aujourd'hui avec facture manquante ;
deux interventions distinctes du même véhicule, chacune à facturer ; une même
action remontée deux fois, une seule occurrence.

### Rien n'est perdu, et ça se vérifie ailleurs aussi

Les visites à facturer sont **aussi** dans Facturation, onglet Factures, bloc
« RDV terminés à facturer », chacune avec son bouton « Générer la facture » :

> Étienne Vasseur — Renault Clio IV · BB-202-BB · **Révision complète**
> Étienne Vasseur — Renault Clio IV · BB-202-BB · **Vidange**

Capture : `APRES4-facturation-visites-a-facturer.png`. Ce bloc n'a aucune
limite de date.

Les demandes, les appels à rappeler et les validations gardent leur bloc et
leurs boutons ; « Argent à risque » et « Ajouter un travail à relancer »
restent, en une ligne, parce qu'ils n'existent nulle part ailleurs.

### Une différence entre deux captures, qui est une preuve et non un défaut

Sur la journée habituelle, la 4ᵉ priorité change entre la capture bureau
(13:58:47) et la capture téléphone (14:00:19) : la Dacia Sandero attendue à
**14:00** passe en retard entre les deux. L'écran ne décore pas le temps, il le
lit — c'est exactement la correction demandée sur les alertes de retard.

## Les actions, cliquées pour de vrai

| Geste | Ce qui se passe | Capture |
|---|---|---|
| Clic sur une arrivée | le **dossier du véhicule** s'ouvre dans le même contexte, avec le client, l'intervention en cours et le rendez-vous | `APRES4-aujourdhui-dossier-depuis-arrivee.png` |
| Fermer le dossier | retour à la liste, à sa place | `APRES4-aujourdhui-retour-liste.png` |
| **Prévenir le client** | l'aperçu réel : destinataire `nadia.lemoine@nexora-recette.invalid`, message exact, **Annuler / Envoyer le message**. Annulé — **rien n'est parti** | `APRES4-aujourdhui-apercu-prevenir.png` |
| **Revalider l'envoi** | « Envoi bloqué depuis le 23 août — le message a changé depuis la validation : nouvelle validation nécessaire », **avant** toute revalidation | `APRES4-aujourdhui-revalider-motif.png` |
| Recherche `F-2026-0001` | la facture, avec sa voiture, son client et son état (Payée · 84,00 €) | `APRES4-aujourdhui-recherche-facture.png` |

### Les trois anciennes voitures prêtes n'ont pas été nettoyées

Le cas de Production — des voitures prêtes depuis fin août, avec une
notification bloquée — est reproduit tel quel sur Test (BG-707-GG, bloquée
depuis le 23 août). **Son état n'a pas été modifié pour faire propre.** La
date et le motif s'affichent dans la liste *et* dans la fenêtre, avant toute
décision. Une ligne bloquée attend un humain, pas un ménage.

## L'erreur de chargement

Requête `rendez_vous` réellement coupée au niveau du réseau :

> **Impossible de charger votre journée.** Ce n'est pas une journée vide : les
> données n'ont pas pu être lues. Rechargez la page dans un instant. Si cela
> persiste, ne vous fiez pas à cet écran pour savoir ce qu'il y a à faire.

avec un bouton **Recharger**. Capture :
`APRES4-aujourdhui-erreur-chargement.png`.

## Les rôles

| Rôle | Capture | Résultat |
|---|---|---|
| dirigeant | `APRES4-aujourdhui-habituelle-bureau.png` | écran complet |
| accueil | `APRES4-aujourdhui-role-accueil.png` | même écran ; Statistiques et Paramètres absents de son menu |
| mécanicien | `APRES4-aujourdhui-role-mecanicien.png` | **n'atteint pas Aujourd'hui** — « Mon atelier », sans prix ni contact client |

## Ce qui a été supprimé avec l'intégration

`app/prototype/aujourdhui/page.tsx`, `components/aujourdhui/AujourdhuiPrototype.jsx`,
`components/aujourdhui/donneesPrototype.js` — la route, l'écran de
démonstration, ses commandes de scénario et ses données fictives. Le module de
règles `components/aujourdhui/priorites.js`, lui, **reste** : c'est lui que
l'écran intégré utilise, et il porte ses 448 tests avec le reste.

## Ce que cette recette ne prouve pas

- Aucun message n'a été envoyé, donc **la réception n'est pas prouvée ici**.
  Elle l'est ailleurs, sur le socle des envois.
- Les données sont fictives. Un garage réel aura des libellés, des volumes et
  des trous que ce jeu ne contient pas.

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
| journée habituelle, bureau | `AVANT3-aujourdhui-habituelle-bureau.png` | `APRES3-aujourdhui-habituelle-bureau.png` |
| journée habituelle, téléphone | `AVANT3-aujourdhui-habituelle-mobile.png` | `APRES3-aujourdhui-habituelle-mobile.png` |
| journée vide | `AVANT3-aujourdhui-vide-bureau.png` | `APRES3-aujourdhui-vide-bureau.png` |
| nouveau garage | `AVANT3-aujourdhui-nouveau-bureau.png` | `APRES3-aujourdhui-nouveau-bureau.png` |

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
| habituelle | `APRES3-aujourdhui-habituelle-bureau.png` | `APRES3-aujourdhui-habituelle-mobile.png` |
| chargée | `APRES3-aujourdhui-chargee-bureau.png` | `APRES3-aujourdhui-chargee-mobile.png` |
| vide | `APRES3-aujourdhui-vide-bureau.png` | `APRES3-aujourdhui-vide-mobile.png` |
| nouveau garage | `APRES3-aujourdhui-nouveau-bureau.png` | `APRES3-aujourdhui-nouveau-mobile.png` |

Plus la page entière : `APRES3-aujourdhui-habituelle-pleine-page.png`.

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

### Une différence entre deux captures, qui est une preuve et non un défaut

Sur la journée habituelle, la 4ᵉ priorité change entre la capture bureau
(13:58:47) et la capture téléphone (14:00:19) : la Dacia Sandero attendue à
**14:00** passe en retard entre les deux. L'écran ne décore pas le temps, il le
lit — c'est exactement la correction demandée sur les alertes de retard.

## Les actions, cliquées pour de vrai

| Geste | Ce qui se passe | Capture |
|---|---|---|
| Clic sur une arrivée | le **dossier du véhicule** s'ouvre dans le même contexte, avec le client, l'intervention en cours et le rendez-vous | `APRES3-aujourdhui-dossier-depuis-arrivee.png` |
| Fermer le dossier | retour à la liste, à sa place | `APRES3-aujourdhui-retour-liste.png` |
| **Prévenir le client** | l'aperçu réel : destinataire `nadia.lemoine@nexora-recette.invalid`, message exact, **Annuler / Envoyer le message**. Annulé — **rien n'est parti** | `APRES3-aujourdhui-apercu-prevenir.png` |
| **Revalider l'envoi** | « Envoi bloqué depuis le 23 août — le message a changé depuis la validation : nouvelle validation nécessaire », **avant** toute revalidation | `APRES3-aujourdhui-revalider-motif.png` |
| Recherche `F-2026-0001` | la facture, avec sa voiture, son client et son état (Payée · 84,00 €) | `APRES3-aujourdhui-recherche-facture.png` |

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
`APRES3-aujourdhui-erreur-chargement.png`.

## Les rôles

| Rôle | Capture | Résultat |
|---|---|---|
| dirigeant | `APRES3-aujourdhui-habituelle-bureau.png` | écran complet |
| accueil | `APRES3-aujourdhui-role-accueil.png` | même écran ; Statistiques et Paramètres absents de son menu |
| mécanicien | `APRES3-aujourdhui-role-mecanicien.png` | **n'atteint pas Aujourd'hui** — « Mon atelier », sans prix ni contact client |

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

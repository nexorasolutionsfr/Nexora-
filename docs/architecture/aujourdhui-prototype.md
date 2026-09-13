# Prototype de l'écran Aujourd'hui

13 septembre 2026. **Prototype, pas une livraison.** À regarder, à critiquer,
puis à intégrer — ou pas.

## L'ouvrir

```bash
npx pnpm@10.34.5 dev --port 3113
```

Puis : **http://localhost:3113/prototype/aujourdhui**

Trois scénarios en haut de page : **Garage vide**, **Journée habituelle**
(12 voitures), **Journée chargée** (14 voitures, blocages, noms longs).
Aucune connexion n'est nécessaire, aucune base n'est lue.

La route renvoie **404 en production** (`process.env.NODE_ENV === "production"`
→ `notFound()`) : elle ne peut pas apparaître sur le site servi aux garages,
même si la branche était fusionnée par erreur.

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

| Zone | Contenu |
|---|---|
| En-tête | « Aujourd'hui », la date, la recherche globale existante |
| Situation | Une phrase, deux chiffres : au garage / demandent une décision |
| **À faire maintenant** | Véhicule, situation, **raison de la priorité**, une action nommée |
| Arrivées et voitures prêtes | Les heures réellement connues, et l'absence d'heure dite |
| Atelier | Quatre chiffres, quatre files, une ligne |

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

## Ce qui a été retiré, et où ça vit maintenant

| Retiré | Où le retrouver |
|---|---|
| « Bonjour {garage} » | nulle part — le garagiste sait qui il est |
| Les quatre grandes cartes de compteurs | le résumé Atelier, une ligne |
| Les raccourcis (Agenda, Clients, Facturation…) | la barre latérale, où ils sont déjà |
| Les explications permanentes sur les envois | l'écran d'envoi, au moment où l'on envoie |
| Le montant « à risque », indicateurs financiers | Statistiques |
| La carte « Mettez votre garage en route » | une ligne discrète en bas |

Le prototype affiche ce tableau en bas de page, pour la revue. Il disparaîtra à
l'intégration.

## Garage vide, et configuration incomplète

- **Garage vide** : une seule entrée utile — « Prendre un rendez-vous ». Pas
  de compteurs à zéro, pas de carte de progression, pas de raccourcis.
- **Garage actif, configuration incomplète** : une ligne grise en bas de page.
- **Un réglage qui bloque une action précise** est signalé là où il bloque, et
  nomme ce qu'il débloque : « Vos horaires ne sont pas renseignés : l'agenda
  proposera des créneaux les jours de fermeture. »

## Style

Moins de cartes emboîtées, pas d'ombre portée, pas de grand aplat marine. Des
lignes alignées séparées par un filet, des titres de section en petites
capitales espacées, la plaque en gras tabulaire, le secondaire en gris. Le bleu
Nexora reste l'accent, et il ne sert qu'aux actions.

## Ce que le prototype ne fait pas

- **Aucune action n'est exécutée.** Un clic ouvre une fenêtre qui nomme la
  destination, la voiture et son état. C'est une maquette navigable, pas une
  demi-fonctionnalité.
- Il ne lit ni n'écrit la base.
- Il n'est pas branché au tableau de bord : l'écran Aujourd'hui actuel est
  inchangé.

## Ce qu'il reste à trancher avant intégration

1. La limite de 4 priorités : le bon chiffre ?
2. « Prête, et le client ne le sait pas encore » suppose `etat_envoi_atelier`
   appelé pour chaque voiture prête — une requête par voiture, comme
   l'Atelier le fait déjà. Acceptable, ou à regrouper ?
3. Faut-il une heure de restitution convenue (colonne + migration) ?
4. Que devient l'écran Aujourd'hui actuel : remplacé, ou les deux cohabitent
   un temps ?

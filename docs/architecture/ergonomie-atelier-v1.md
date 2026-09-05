# Ergonomie de l'atelier — V1

Passe sur le tableau de bord à **375 px**, la largeur d'un téléphone. La
démonstration se fait sur téléphone (constat du déplacement chez CD Auto), et
c'est aussi là que le garagiste consulte son agenda, entre deux voitures, les
mains sales.

## Le défaut le plus coûteux : un bouton qui ne peut pas tenir sa promesse

« Connecter Google » était l'élément le plus visible de l'agenda — pleine
largeur, bleu, au-dessus de la recherche. Il lisait
`NEXT_PUBLIC_GOOGLE_CALENDAR_CONNECT_URL`, qui n'est pas renseignée. Au clic, le
garagiste recevait :

> Ajoutez NEXT_PUBLIC_GOOGLE_CALENDAR_CONNECT_URL après avoir configuré
> l'autorisation Google dans n8n

Un message d'ingénieur, sur l'écran d'un garage, en démonstration.

Son libellé lisait par ailleurs `garageData.google_agenda_connecte`, **une
colonne qui n'existe sur aucun des deux projets Supabase** : l'état
« Google synchronisé » était inatteignable, et trois autres écrans affichaient
en permanence « non connecté » — dont Paramètres, avec « À connecter dans
**n8n** », le nom d'un outil interne que le garage ne connaît pas et sur lequel
il ne peut rien.

**Règle retenue : un contrôle qui ne peut pas fonctionner ne s'affiche pas.**
Tout ce qui touche à Google Agenda est conditionné à
`GOOGLE_CALENDAR_CONFIGURE`. Tant que la connexion n'existe pas, Nexora n'en
parle pas — plutôt que de désigner un manque là où il n'y a rien à connecter.

## L'agenda contredisait l'accueil

La grille du jour était une constante, `08:00`–`17:00`, tous les jours. Un
samedi où l'accueil annonce « Fermé aujourd'hui », l'agenda proposait dix
créneaux « disponibles · + Ajouter ». Des deux écrans, celui qui avait tort
était celui qui invitait à prendre un rendez-vous.

`components/agenda/horaires.js` lit `garages.horaires`. Trois règles y sont
inscrites, et testées :

**Un rendez-vous déjà pris est toujours visible.** Un garage dépanne le samedi,
ouvre plus tôt pour un client pressé, garde une voiture après la fermeture.
Masquer une heure hors plage ferait *disparaître* un rendez-vous de l'agenda —
bien pire que le défaut corrigé. Les heures occupées sont donc toujours
ajoutées à la grille, et l'heure porte alors la mention « Hors ouverture » au
lieu d'une invitation à réserver.

**Des horaires absents ne sont pas une fermeture.** C'est une ignorance. On
n'annonce pas au garage qu'il est fermé faute de savoir : sans horaires, la
grille reste celle d'avant.

**La réservabilité est un chevauchement, pas une appartenance.** Un garage qui
ouvre à 08:30 a une demi-heure à vendre dans la tranche de 08:00. La première
version comparait `08:00` au début de la plage et déclarait l'heure « hors
ouverture » — défaut trouvé sur les horaires réels du garage de démonstration,
où les demi-heures sont la règle. Le test porte donc sur l'intersection de
`[h, h+1h[` avec la plage.

Un jour fermé affiche un état clair, **avec un bouton « Ajouter quand même »** :
on n'empêche rien, un dépannage n'attend pas la semaine.

## Ce que 375 px révélait

| Écran | Avant | Après |
| --- | --- | --- |
| Clients | Le `select` de tri imposait la largeur de « Plus fidèle → moins fidèle » et laissait ~60 px à la recherche, où « Rechercher » tenait en « **Re** » | La recherche prend toute la largeur, tri et « + » passent dessous |
| Fiches atelier | « Peugeot 308 SW · DM-… » — **l'immatriculation, seule chose qui identifie la voiture qu'on a devant soi, était le premier élément coupé** | L'immatriculation d'abord, en gras, jamais tronquée ; le modèle cède la place |
| Fiches atelier | « Claire Bernard · 04 sept. 2… » | L'année retirée en liste : c'est l'heure qu'on cherche |
| Recherches | « Rechercher un client, véhicule, immatricula » | « Client, véhicule, immatriculation… » |
| Statistiques | Une courbe **sans aucune échelle** : ni montant, ni date | Maximum, pas de temps, bornes de période, ligne de zéro |
| Atelier | « 🖨️Imprimer les étiquettes » | espace rétabli |

Les repères du graphique sont posés en **HTML autour du SVG**, pas dedans : il
est tracé en `preserveAspectRatio="none"`, qui étire le tracé — et étirerait le
texte avec lui.

## Reste à faire

L'accueil montre quatre cartes à zéro qui occupent le premier écran d'un
téléphone. Les autres vues n'ont pas été revues en profondeur, et le monolithe
`NexoraDashboard.jsx` (6 400 lignes) reste à découper avant tout travail de
fond sur la mise en page.

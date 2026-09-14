# Recette — constat → devis, modèles de travaux, suivi et relances

14 septembre 2026 (nuit). **Supabase Test seulement.** Rien n'est fusionné,
rien n'est appliqué en Production, aucun message réel n'est parti.

Branche `integ/constat-devis-suivi` (depuis `origin/main` = `15eead5`).

## Le jeu

`node scripts/recette/jeu-constat-devis.mjs creer` → garage
**PROTO Constat 2026-09-14-16h26** (`31578a46-deba-4dd6-9487-7f2d876ec00f`) :

| Compte | Rôle |
|---|---|
| `recette.constat.2026091416h26@nexora-recette.invalid` | dirigeant |
| `recette.constat.accueil.2026091416h26@…` | accueil actif |
| `recette.constat.meca.2026091416h26@…` | mécanicien affecté |
| `recette.constat.revoque.2026091416h26@…` | accueil **révoqué** |

Peugeot 308 SW **BA-101-AA** (même plaque que la 208 de « PROTO Atelier » :
deux garages, une plaque), rendez-vous du jour en diagnostic, contrôle ouvert
(dommage avec photo, à valider **refusé** par le client, à surveiller, OK),
contrôle verrouillé plus ancien (point validé), un devis en attente chiffré,
un devis accepté. Mercedes au nom long pour les débordements.

Accès : `node scripts/recette/acces-test.mjs lien <email> 3000`, puis ouvrir
la redirection sur `http://localhost:3000/dashboard#…` (serveur de dev lancé
depuis le worktree). Aucun mot de passe.

## Preuves automatisées

| Contrôle | Commande | Résultat |
|---|---|---|
| Unitaires (tout le dépôt) | `node --test $(find components lib -name "*.test.js")` | **491 / 491** |
| Constat → devis, serveur | `node scripts/recette/constat-devis-serveur.mjs <garage>` | **31 / 31** |
| Modèles de travaux, serveur | `node scripts/recette/modeles-travaux-serveur.mjs <garage>` | **25 / 25** |
| Suivi partagé + relances, serveur | `node scripts/recette/relances-travaux-serveur.mjs <garage>` | **32 / 32** (rejoué après `000500`) |
| Migrations sur le schéma de **Production** (base jetable) | `bash docs/recette/base-jetable-2026-09-14.sh` | **5 migrations OK, 53 / 53** |

Les trois scripts serveur ont été **rejoués après `20260919000500`** :
31/31, 25/25, 32/32.

### Deux écarts trouvés par les preuves elles-mêmes

1. **Privilège d'écriture resté ouvert** (base jetable, 1 KO sur 42 au premier
   passage) : `authenticated` gardait insert/update/delete sur
   `devis_reprises`, `devis_insertions_modeles` et `relances_travaux` —
   privilèges accordés par défaut par Supabase, que les migrations ne
   retiraient pas. La RLS refusait déjà ces écritures (seule une politique de
   lecture existe). `20260919000500` ferme aussi le privilège ; vérifié sur
   Test (insert/update/delete : faux, select : vrai) et sur la base jetable.
2. **Isolation insuffisante du script de relances** : la réservation est
   bornée au garage, pas au script. Au second passage, elle a pris la relance
   autorisée **depuis l'écran** (`fb259234…`) et l'a passée `envoi_en_cours`.
   Aucun transport n'a eu lieu. Réparé à la main, en le disant :
   `terminer_relance_travail(…, 'bloque', « réservée par erreur par le script
   de recette… aucun transport »)`. Le script refuse désormais de jouer la
   section réservation si le garage porte une autre relance autorisée, et
   n'affirme plus que sur sa propre ligne.

Les scripts serveur ouvrent de **vraies sessions** (lien magique + OTP) et
n'utilisent la clé de service que pour lire l'état ou jouer le rôle de n8n.

Cas couverts, en résumé : deux appels simultanés avec le même identifiant
(une reprise, une insertion, une réservation) ; point refusé par le client ;
devis verrouillé ; dirigeant d'un autre garage ; accueil révoqué ; mécanicien ;
contrôle verrouillé (lecture) ; constat d'un autre véhicule (fonction et
trigger) ; chiffrage incomplet refusé au jeton, à l'autorisation d'envoi, à la
lecture et à la réponse publiques ; empreinte du devis modifiée ; modèle
modifié sans effet sur un devis existant ; modèle archivé ; prix manquant →
« Prix à renseigner » ; report d'un travail → relance obsolète ; clôture →
annulée ; message modifié après autorisation → mis de côté ; `envoi_en_cours`
jamais repris.

## Parcours joué à l'écran (navigateur intégré)

1. **Dirigeant** — Aujourd'hui → recherche « BA-101 » → dossier →
   **« Préparer le devis depuis le constat »**. Les trois blocs s'affichent :
   demande du client (prestation + notes du rendez-vous), constat (plaquettes
   cochées avec photo, pare-brise **décoché et marqué refusé**, pneu cochée),
   travaux proposés (« Compléter le devis Réf. 6FB658 · sans visite » ou
   « Nouveau devis pour cette visite », par défaut **nouveau**).
2. Choix « Compléter » → « Ajouter au devis » → l'écran Devis s'ouvre sur ce
   devis : badge **À chiffrer**, bandeau « 2 lignes attendent leur prix »,
   lignes avec chip **Constat**, note du mécanicien et **vignette** ; blocs
   d'envoi, de lien et de réponse **remplacés** par une phrase.
3. **Chiffrer** plaquettes → 89 € : totaux relus, « 1 ligne attend son prix ».
4. **Ajouter une ligne** : pièce « Jeu de plaquettes avant », 64 €, **Constat
   concerné = Plaquettes** → la pièce porte le chip Constat et la photo.
5. Chiffrer le pneu → 35 € : plus aucune ligne à renseigner ; les blocs
   « Envoyer au client », lien et réponse **reviennent** ; total 297,60 € TTC.
6. Paramètres › Mon garage › **Modèles de travaux** → « Nouveau modèle »
   « Plaquettes avant », 3 lignes (dont une sans prix) → la liste affiche
   « 3 lignes · 153,00 € HT + 1 à renseigner ».
7. **Accueil** — Aujourd'hui (liste complète) : la ligne « Pneus arrière à
   remplacer · reporté depuis 3 jours · relance préparée, à relire » porte le
   bouton **« Relire la relance »**. La fenêtre montre travail, échéance,
   destinataire (`claire.fontaine@nexora-recette.invalid`), sujet et message
   composés en base. **« Autoriser l'envoi »** → message « Elle partira au
   prochain passage » ; la ligne dit « relance autorisée, départ en attente ».
   Vérifié en base : `en_attente`, `autorise_par` = le compte accueil,
   `envoye = false`. Rien n'est parti (aucun workflow n'a tourné).
   _État actuel de cette relance : `bloque`_, voir l'écart n° 2 ci-dessus.

Comptage avant / après, pour ce parcours (deux constats) : **avant**, aller
dans Devis, choisir client puis véhicule, retaper deux libellés et deux
commentaires, puis revenir au contrôle pour vérifier la photo — 3 changements
d'écran, 4 champs de texte retapés. **Après** : 1 changement d'écran (dossier
→ Devis), 0 champ de texte retapé ; restent les prix, qui ne se devinent pas.
Aucun gain en minutes n'est avancé.

## Mobile

Captures headless à **430** et **375** px :
`docs/recette/captures/constat-devis-2026-09-14/saisie-controle-{430,375}.png`
et `preparer-devis-375.png` (compte accueil, ouvert par la vraie recherche →
dossier → bouton) : fenêtre ouverte, titre visible, **0 élément** au-delà de
la largeur, point refusé décoché avec sa raison, bouton « Créer le devis »
atteignable en bas.

Deux défauts trouvés et corrigés :

- la page s'élargissait à **548 px** sur téléphone : le bloc titre de
  l'en-tête (sous-titre `truncate` sans `min-w-0`) — c'est lui qui rendait les
  fenêtres « coupées à droite » ;
- une fois la largeur corrigée, l'**en-tête collant recouvrait le haut** des
  fenêtres de contrôle (titre, progression, fermer) : elles sont désormais
  rendues dans `document.body` (`garage-os/Portail.jsx`). Mesuré : titre à
  12 px du haut, visible, aucun débordement (`scrollWidth = innerWidth`).

## Ce que la recette ne prouve pas

- **Aucun message réel** : le transport des relances est simulé ; le workflow
  n8n de Test n'a **pas été importé ni exécuté**.
- La **page publique** du devis ne montre pas la photo du constat (non livré).
- Le **mécanicien** ne saisit pas encore de constat depuis son écran.
- Les **captures** prouvent la mise en page, pas l'absence de régression
  ailleurs ; le build de production (`next build`) n'a pas été lancé.
- Le **clavier** n'a pas été rejoué avec de vraies frappes sur les nouvelles
  fenêtres (seulement Échap par code).

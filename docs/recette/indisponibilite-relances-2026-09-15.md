# Recette — relances de travaux différés annoncées indisponibles (PR #101), 15 septembre 2026

Supabase **Test**, serveur de dev de cette branche (`http://localhost:3000`),
Chrome headless piloté par `scripts/recette/capture.mjs` (vraie session par lien
à usage unique, profil jetable). Aucun message envoyé, aucun workflow touché.

## Le défaut

« Aujourd'hui » transformait la ligne d'un travail différé dont une relance
était préparée (`a_relire`, `bloque`) en « Relire la relance » / « Revoir la
relance », qui ouvrait `RelanceTravailModal` avec **« Autoriser l'envoi »** —
accessible au dirigeant et à l'accueil (la table et la fonction leur sont
ouvertes). Une relance autorisée affichait « relance autorisée, départ en
attente ». Or aucun workflow n'expédie ces relances et leur activation reste
bloquée : opposition du client non saisissable à l'écran et absente du
message, activation non bornée à un garage volontaire, réception Brevo non
prouvée. L'écran laissait croire qu'elles partiraient.

## La correction

- `components/parametres/capacites.js` — mécanisme existant (« ne passer à
  `true` que contre une preuve d'envoi réel ») : nouvelle entrée
  `relanceTravauxDifferes`, `disponible: false`. Constante du code, pas un
  réglage : aucun interrupteur à l'écran, aucun réglage en base.
- `components/aujourdhui/relanceLigne.js` (pur, testé) : tant que la capacité
  est indisponible, la ligne garde son geste de suivi manuel (« Ouvrir la
  fiche », « Marquer traité », « Reporter ») ; une relance `a_relire`,
  `bloque` ou `en_attente` ajoute seulement « envoi des relances pas encore
  disponible ». Les faits passés restent dits (« relance envoyée le … »,
  « envoi à vérifier »).
- `RelanceTravail.jsx` : la fenêtre, si elle était ouverte par un autre
  chemin, n'affiche pas « Autoriser l'envoi » mais la même phrase, et
  `autoriser()` ne fait rien.
- Aucun autre envoi n'est concerné : devis, factures, notifications
  inchangés. Aucune migration.

## Vérification sur Test

Garage fictif « PROTO Constat 2026-09-14-16h26 » (`31578a46…`), qui porte déjà
des relances `bloque`, `en_attente`, `envoi_en_cours`, `envoye`, `annulee`,
`obsolete`. Une relance `a_relire` fictive y a été ajoutée par
`preparer_relances_travaux` bornée à un travail créé pour l'occasion
(« Disques avant à surveiller (recette indisponibilité) », client
`@nexora-recette.invalid`). Rien n'a été autorisé.

| Session | Geste réel | Constat |
|---|---|---|
| dirigeant | « Voir toutes (22) », lecture des lignes | `a_relire`, `bloque`, `en_attente` : « … · envoi des relances pas encore disponible » ; aucun bouton « Relire / Revoir la relance », aucun « Autoriser l'envoi » |
| dirigeant | clic sur le geste de la ligne « Disques avant » | « Ouvrir la fiche » ; aucune fenêtre de relance, aucun dialogue |
| accueil | mêmes lectures et même clic | identique |
| accueil | ligne dépliée › « Marquer traité » | « Marqué traité — rien n'a été envoyé ni facturé », ligne retirée |
| dirigeant | « Suivi et reports (2) » › « Disques avant … marqué traité » › « Remettre » | ligne revenue dans Aujourd'hui, « Suivi et reports (1) » |
| base | relevé `relances_travaux` du garage avant et après tous les gestes | **identique** (`diff` vide) : aucune relance armée ni modifiée |

Tests : `relanceLigne.test.js` 5/5 ; `capacites.test.js` couvre la nouvelle
entrée ; suite unitaire 517/517.

Captures : `captures/indisponibilite-relances-2026-09-15/`.

## Limite

La fonction `autoriser_envoi_relance_travail` reste exécutable par un
utilisateur authentifié qui l'appellerait **hors de l'interface**. La ligne
passerait `en_attente` sans qu'aucun workflow ne la réserve : rien ne part
(aucun workflow des relances n'est importé dans n8n). La fermer en base
demanderait une onzième migration, hors périmètre de cette publication.

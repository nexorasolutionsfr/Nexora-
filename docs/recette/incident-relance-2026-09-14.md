# Incident de recette — relance réservée hors périmètre

14 septembre 2026, Supabase **Test**, garage « PROTO Constat 2026-09-14-16h26 »
(`31578a46-deba-4dd6-9487-7f2d876ec00f`). **Aucun message n'est parti** :
aucun workflow n'a tourné, aucun transport n'a été appelé.

## Ce qui s'est passé

| Heure (UTC) | Fait |
|---|---|
| 17:14:36 | `preparer_relances_travaux` prépare la relance `fb259234-68bb-4aa0-ae1a-86ab34dead73` pour le travail différé `ba01fdd3-…` (« Pneus arrière à remplacer »), statut `a_relire`. |
| 17:19:52 | Le compte **accueil** l'autorise **depuis l'écran** (« Autoriser l'envoi ») : `en_attente`, `autorise_par = 8964d62d-…`, `destinataire_valide = claire.fontaine@nexora-recette.invalid`. |
| ~17:26 | Le script `scripts/recette/relances-travaux-serveur.mjs` est rejoué. Sa section « réservation » appelle `reserver_relances_travaux(10, [garage])`, bornée **au garage seulement**. Elle prend sa propre ligne **et** `fb259234…`, qui passe `envoi_en_cours`, `tentatives = 1`. Le script ne clôt que sa propre ligne. |
| 17:28:53 | **Correction manuelle** (clé de service) : `terminer_relance_travail('fb259234-…', 'bloque', 'réservée par erreur par le script de recette serveur (isolation insuffisante) : aucun transport n''a eu lieu, rien n''est parti ; à revalider si besoin')`. |

## État exact de la ligne, relevé après correction (inchangé depuis)

```
id                   fb259234-68bb-4aa0-ae1a-86ab34dead73
statut               bloque
tentatives           1
envoye               false
autorise_par         8964d62d-8884-4700-ab9c-2c6b9c0f01c8
autorise_le          2026-09-14T17:19:52.26157+00:00
destinataire_valide  claire.fontaine@nexora-recette.invalid
empreinte_document   9089d73ba86d157d8e371c77c706596854ebb9288c4c009e51859f448eea2554
derniere_erreur      réservée par erreur par le script de recette serveur (isolation insuffisante) : aucun transport n'a eu lieu, rien n'est parti ; à revalider si besoin
updated_at           2026-09-14T17:28:53.044815+00:00
```

## Ce qui était faux dans la correction

Passer la ligne en `bloque` était une **réparation arbitraire** : l'état vrai
était « réservée par un tiers, sans transport ». `bloque` signifie dans ce
modèle « mise de côté par une règle (document ou destinataire changé) » ; il
a été utilisé ici pour effacer un effet de la recette. Le compteur
`tentatives = 1` compte une tentative qui n'a pas eu lieu.

**Décision** : la ligne n'est plus touchée. Elle reste dans cet état, avec son
motif explicite, comme trace. Toute future recette la laisse en place ; la
revalider serait un geste du garage, depuis l'écran.

## La cause, et sa correction

La borne « garage » n'isole pas une recette des lignes réelles de ce garage.
Un contrôle préalable côté script (« aucune autre relance en attente ») ne
suffit pas non plus : une ligne peut être autorisée entre ce contrôle et la
réservation.

Correction : `20260919000600_relances_perimetre_atomique.sql`.
`reserver_relances_travaux` et `preparer_relances_travaux` acceptent un
périmètre explicite (`p_relances`, `p_travaux`) **appliqué dans la même
instruction** que la mise de côté et la prise. `NULL` (Production) garde le
comportement antérieur. Le script de recette passe désormais sa propre ligne,
et vérifie deux cas : une relance hors périmètre déjà `en_attente`, et une
relance autorisée **pendant** la réservation — aucune n'est ni réservée ni
modifiée (statut, tentatives et `updated_at` comparés avant/après).

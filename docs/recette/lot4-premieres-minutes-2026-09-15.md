# Recette — Lot 4 « les dix premières minutes d'un garage », 15 septembre 2026

Branche `lot4/premieres-minutes` (depuis `main` `32f52fe`, **indépendante des
lots 1 à 3**). Supabase **Test**, compte synthétique **existant**
`recette.aujourdhui.nouveau.2026091311h58@nexora-recette.invalid` (« garage qui
vient d'ouvrir »). **Aucun compte créé, aucune donnée enregistrée** dans ce
garage (il sert d'état vide à d'autres recettes), **aucun e-mail déclenché**.
Chrome headless, bureau 1280 px et téléphone 375 px. Aucune migration.

## Audit

| Moment | Constat | Verdict |
|---|---|---|
| Entrée dans l'espace | « Votre garage est prêt. Il n'y a encore aucun client ni véhicule enregistré. » puis « Commencez par vos clients » avec « Ajouter un client » et « Importer mon fichier » | clair |
| Indispensable / facultatif | « Mettez votre garage en route » sépare « Commencer à utiliser Nexora » (client, rendez-vous, devis) et « Configurer mon garage » (horaires, équipe) avec « Plus tard » | clair ; les étapes sont accessibles au clavier (`role="button"`, `tabIndex`, touche Entrée) |
| Première opération utile | **« Ajouter un client » menait à la page Clients, qui redemandait « Ajouter un client »** — deux clics pour un geste | **défaut, corrigé** |
| Formulaire client | « Nouveau client » : nom, téléphone et e-mail facultatifs, « Sa voiture — facultatif, la plaque suffit » | clair ; fermé sans enregistrer |
| Réglages non opérationnels | Notifications : réponse automatique et rappels dits « pas encore branchés » ; SMS et WhatsApp **désactivés** (« Pas encore disponible »), seul l'e-mail choisissable | conforme |
| Promesse des Paramètres | **« Vos changements alimentent directement le dashboard et les automatisations »** alors que les automatisations ne sont pas actives | **défaut de texte, corrigé** |
| Lien de connexion expiré | retour `#error=…&error_code=otp_expired` (format de ce client Supabase, flux implicite par défaut) → « Lien expiré — Demandez un nouvel e-mail de confirmation », champ adresse, « Se connecter » | clair ; le format `?error=…` affiche la connexion simple, mais ce client ne le produit pas |
| Renvoi d'e-mail de confirmation | bouton présent | **non déclenché** : l'envoi passerait par le fournisseur d'e-mails de Test |

## Corrections

- `NexoraDashboard.jsx` : « Ajouter un client » de l'écran vide passe par
  `allerConfigurer("clients", null, "client")` — le même mécanisme que la mise
  en route : le formulaire s'ouvre en arrivant.
- En-tête des Paramètres : « Vos réglages s'appliquent au tableau de bord, à
  l'agenda et à vos documents. Ce qui n'est pas encore automatique est indiqué
  dans Notifications. »

## Vérification après correction

| Geste | Résultat |
|---|---|
| Aujourd'hui › « Ajouter un client » (bureau) | « Nouveau client » ouvert, focus sur « Nom du client » ; Annuler, rien enregistré |
| Même geste à 375 px | fenêtre ouverte, aucun débordement |
| Paramètres | nouvel en-tête affiché |

Captures : `captures/lot4-2026-09-15/`.

## Limites

- Parcours complet « premier client → premier rendez-vous → premier devis » non
  rejoué avec enregistrement : il aurait rempli le seul garage vide de
  référence. Le rejouer demande un garage synthétique de plus (création de
  compte, non faite ici).
- Renvoi de l'e-mail de confirmation et réception : non testés (aucun envoi).
- Horaires d'un garage neuf tous « Fermé » : signalé par la mise en route
  (« Sinon l'agenda propose des créneaux les jours de fermeture »), non modifié.

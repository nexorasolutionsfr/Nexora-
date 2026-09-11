# Les dix premières minutes d'un nouveau garage — recette du 11 septembre 2026

Question posée : un patron de garage fatigué, interrompu, peu à l'aise avec les
logiciels comprend-il immédiatement quoi faire, où cliquer et ce qui va se
passer ?

## Conditions de la mesure

- **Environnement** : application locale (`localhost:3000`, code identique à
  `main` @ `c92dba1`) branchée sur Supabase **Test** (`slawilafseganlbghgwx`).
- **Compte** : `recette.dixmin.avant@nexora-recette.invalid`, créé par la clé
  de service de Test ; garage « Garage Recette Dix Minutes » créé par l'écran
  de mise en service. Client `client.dixmin.avant@nexora-recette.invalid`,
  immatriculation `DEMO-110-DM`. Aucune donnée réelle, aucun autre garage lu.
- **Ce qui n'a pas été joué par l'agent** : la soumission du formulaire
  d'inscription et le clic dans l'e-mail de confirmation (créer un compte avec
  un mot de passe reste un geste humain). Le formulaire a été observé ; la
  confirmation est remplacée par un lien de connexion généré sur Test.
- **Étape 14** : aucun traitement ne consomme la file de Test. Le passage du
  traitement a été **simulé** (réservation bornée au seul garage de recette,
  puis clôture « envoyé »), avec les fonctions mêmes qu'emploie n8n.
- **Opérateur** : un agent qui pilote le navigateur. Les durées mesurent cet
  opérateur, pas un humain ; elles comptent surtout en comparaison avant/après.
  Les pertes dues à l'outil (panneau masqué, premier lien consommé) sont
  notées à part.

## Parcours avant correction (chronométré)

Début 11:23:59, fin 11:38:10 — **14 min 11 s**, dont ≈ 2 min d'artefacts
d'outil. Environ **30 clics**, **14 champs saisis**, **3 impasses**.

| # | Étape | Constat |
|---|---|---|
| 1–2 | `/dashboard` → « Créer mon espace » | L'écran d'arrivée d'un visiteur dit « Bon retour ». Le lien d'inscription est un texte en bas de carte. 1 clic. |
| 3 | Formulaire | 2 champs, promesse claire (14 jours, sans carte). Correct sur mobile. |
| 4–5 | Confirmation, retour | Non joué par l'agent (voir plus haut). |
| 6 | Mise en service | 4 champs dont 1 obligatoire, puis activités. 4 clics. Clair. |
| 7 | Accueil vide | Pastille « Ouvert maintenant » alors qu'aucun horaire n'est saisi. « Mettez votre garage en route » : horaires, équipe, clients, rendez-vous — **ni client à la main, ni devis**. Menu de 11 entrées dont « Demandes » (plus rien ne l'alimente) et « Notifications à vérifier ». |
| 8 | Premier client | La ligne guidée « Vos clients et véhicules » mène à la **reprise CSV** : impasse pour qui n'a pas de fichier. Écran Clients vide : « Aucun client ne correspond à cette recherche » (il n'y a pas de recherche), fiche fantôme « CL » avec Appeler/SMS/Devis actifs, création derrière un « + » sans libellé. E-mail « optionnel » sans dire qu'il sert à envoyer le devis. Aucun message après création. |
| 9 | Premier véhicule | **Impossible depuis la fiche client.** Seul chemin : Agenda → créer un rendez-vous fictif → « + Nouveau véhicule ». Le rendez-vous s'affiche « Confirmé ». 5 clics de détour. |
| 10 | Premier devis | « Les demandes de devis apparaîtront ici » (promesse automatique). Modale : client, prestation (catalogue **tout à 0,00 € HT**), montant HT unique. Les lignes main-d'œuvre/pièce ne se saisissent qu'après création. Totaux justes (105 HT, 21 TVA, 126 TTC), mais « 126.00 » (point) en tête et « 126,00 » (virgule) en bas. |
| 10bis | **Envoi non demandé** | **Dès « Créer le devis », à 0,00 €, la carte affiche « En attente d'envoi — L'envoi est programmé ».** En base : notification `en_attente` avec jeton, sans destinataire validé ni empreinte — donc réservable. Définitions identiques en Production, où « Nouveau devis (socle) » tourne toutes les 2 minutes : le client aurait reçu « Un devis vous attend : 0.00 € ». |
| 11 | Lien client | « Générer le lien client (réponse à distance) » : le lien s'affiche avec Copier/Révoquer, sans dire qu'il n'envoie rien ; « Copier » ne confirme rien ; le lien disparaît au rechargement. |
| 12 | Aperçu | « Aperçu client » affirme « exactement ce que le client verra » mais **n'a ni les lignes ni HT/TVA** que la page publique affiche. Son bouton « Fermer » est hors écran à 1280×800. L'aperçu du **message** n'est pas atteignable. |
| 13 | Autorisation | **Impossible** : le bouton « Valider et envoyer » n'existe plus, l'envoi étant déjà programmé. |
| 14 | État | (simulé) « Envoyé — Le message est parti », sans destinataire affiché. L'accueil propose encore « Devis prêt — Prévisualiser et envoyer ». |
| 15–16 | Client | Page publique fidèle (lignes, HT/TVA/TTC), lisible à 375 px. « Accepter » → « Vous avez accepté ce devis. » |
| 17 | Réponse côté garage | Écran ouvert : rien ne change (pas de relecture). Après rechargement, le devis **disparaît** de l'accueil (« rien qui bloque ») et de l'onglet Devis (« Aucun devis en attente »). On le trouve dans **Facturation › Historique**, 3ᵉ onglet. L'acceptation a par ailleurs mis en file un e-mail « Votre devis a été confirmé » que le garage ne voit nulle part. |
| 18 | Déconnexion / reconnexion | Bouton icône seule. Reconnexion : retour à l'accueil, sans trace de la réponse. |

Mobile (375 px, mesuré) : aucun débordement horizontal sur l'accueil, les
clients, la facturation ; la modale de devis tient à l'écran ; le menu passe
par une icône sans libellé.

## Classement

P0 : aucun — l'inscription et l'usage restent possibles.

### P1 — peut faire abandonner ou provoquer une action dangereuse

| id | Preuve | Conséquence | Correction minimale | Critère |
|---|---|---|---|---|
| P1-a | Devis créé → notification `en_attente` avec jeton, empreinte nulle ; écran « En attente d'envoi » à 0,00 € | Le client reçoit un devis vide ou provisoire, sans que le garage l'ait décidé | `notifier_nouveau_devis` crée la notification `sans_lien` ; seul `autoriser_envoi_devis` la rend envoyable | Après création : état « Pas encore envoyé », bouton d'envoi visible, aucune ligne `en_attente` en base avant confirmation |
| P1-b | Aucun moyen de créer un véhicule depuis le client ; détour par un rendez-vous fictif | Impasse ou faux rendez-vous « Confirmé » | Véhicule dans « Nouveau client » et « + Ajouter un véhicule » sur la fiche | Client + véhicule créés en une modale, sans rendez-vous |
| P1-c | L'aperçu « exact » omet lignes et TVA ; « Fermer » hors écran | Le garage valide une version différente de ce que reçoit le client | Un seul composant pour l'aperçu et la page publique ; modale défilante | Aperçu et page publique rendus par le même composant, même modèle testé |
| P1-d | Mise en route : « clients » → reprise CSV ; ni client à la main ni devis | Le garage sans fichier ne trouve pas la première action utile | Étapes « Votre premier client et sa voiture » et « Votre premier devis », qui ouvrent directement la bonne fenêtre | Depuis l'accueil vide, 1 clic ouvre « Nouveau client » |

### P2 — ralentit ou fait hésiter

| id | Preuve | Correction minimale | Critère |
|---|---|---|---|
| P2-a | Réponse client introuvable hors Historique ; écran non relu | Section « Réponses des clients » dans Devis, ligne sur l'accueil, relecture au retour sur l'onglet | Réponse visible dans Devis et sur l'accueil sans connaître Historique |
| P2-b | Lien, envoi, acceptation mélangés sur la carte ; « Refuser » ambigu | Carte en trois temps : envoyer par e-mail / lien à transmettre soi-même / réponse reçue autrement | Libellés testés, lien dit « n'envoie rien » |
| P2-c | Toast « Envoi validé — part dans les minutes qui viennent » | « Envoi programmé… passera à « Envoyé » » | Test : aucun succès ni délai pour une mise en file |
| P2-d | États vides trompeurs (Clients, Devis, Demandes) | Une phrase vraie + le bouton qui crée le premier élément | Textes sans promesse automatique |
| P2-e | « Ouvert maintenant » sans horaires | Pas de pastille tant que rien n'est saisi | Garage neuf : pas de pastille |
| P2-f | « Demandes » et « Notifications à vérifier » visibles sans rien derrière | Masquées tant qu'elles sont vides | Garage neuf : entrées absentes |
| P2-g | Client créé sans confirmation ; e-mail « optionnel » | Toast « Client enregistré » ; « E-mail — pour lui envoyer devis et factures » | Message après création |
| P2-h | Devis : montant unique puis lignes ; catalogue à 0 € | Plus de montant dans la modale ; la saisie des lignes s'ouvre sur le devis créé | Devis créé → formulaire de ligne ouvert |
| P2-i | « Marquer accepté/refusé » sur un devis déjà répondu : succès affiché sans effet | Vérifier la ligne modifiée, sinon relire et le dire | Aucun faux succès |

### P3 — finition (non traitée tant que des P1/P2 existent)

Point/virgule dans les montants de l'en-tête de carte et de l'e-mail
(`126.00 €`, sans « TTC ») ; icône téléphone décalée sur la fiche client ;
libellé « Prestation » sur un rendez-vous sans prestation ; logo « Nexora
Solutions » ; icônes de menu et de déconnexion sans libellé ; la page client ne
dit pas ce qui suit l'acceptation.

### Hors périmètre, documenté

- **Facture** : `notifier_nouvelle_facture` a le même défaut que P1-a (mise en
  file dès la génération). Hors des dix premières minutes ; même correction à
  prévoir dans un lot séparé.
- L'acceptation met en file un e-mail « Votre devis a été confirmé. Nous vous
  contacterons pour planifier l'intervention » que le garage ne relit pas.
- Sur Test, `url_publique` pointe vers le site de Production : un lien envoyé
  depuis Test serait mort. Réglage d'environnement, pas défaut produit.

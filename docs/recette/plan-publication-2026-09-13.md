# Plan de publication — corrections métier du 13 septembre 2026

**Rien n'est fusionné. Rien n'est appliqué en Production.** Ce document dit ce
qu'il faudrait faire, dans quel ordre, et ce qui casserait si on se trompait.

---

## 1. L'ensemble proposé : #89 → #94, #96, #97 — sans #95

Huit branches empilées, fusionnées **dans cet ordre**, chacune dans la
précédente puis la première dans `main`.

| Ordre | PR | Branche | SHA | Dans l'ensemble ? |
|---|---|---|---|---|
| 1 | [#89](https://github.com/nexorasolutionsfr/Nexora-/pull/89) | `feat/atelier-continuite` | `055619c` | **oui** |
| 2 | [#90](https://github.com/nexorasolutionsfr/Nexora-/pull/90) | `feat/recherche-documents` | `7db0a1d` | **oui** |
| 3 | [#91](https://github.com/nexorasolutionsfr/Nexora-/pull/91) | `fix/fil-attentes-et-libelles` | `fa1d28e` | **oui** |
| 4 | [#92](https://github.com/nexorasolutionsfr/Nexora-/pull/92) | `ux/atelier-vide` | `85b399f` | **oui** |
| 5 | [#93](https://github.com/nexorasolutionsfr/Nexora-/pull/93) | `docs/reduire-saisie-devis` | `212ca08` | **oui** (documentation seule) |
| 6 | [#94](https://github.com/nexorasolutionsfr/Nexora-/pull/94) | `fix/plaque-unique-par-garage` | `c3ff2c7` | **oui** |
| 7 | [#96](https://github.com/nexorasolutionsfr/Nexora-/pull/96) | `fix/pret-nenvoie-rien` | tête de branche¹ | **oui** — porte les 7 migrations |
| 8 | [#97](https://github.com/nexorasolutionsfr/Nexora-/pull/97) | `feat/aujourdhui-integre` | tête de branche¹ | **oui** — l'écran Aujourd'hui intégré |
| — | [#95](https://github.com/nexorasolutionsfr/Nexora-/pull/95) | `ux/prototype-aujourdhui` | — | **non — sans objet, à fermer** |

¹ Ces deux branches portent ce document ou dépendent de lui ; y inscrire leur
propre empreinte la rendrait fausse à la ligne suivante. La tête à fusionner
est celle qu'affiche la PR au moment de la revue.

> **#95 est devenue sans objet.** C'était le prototype ; #97 le remplace par
> l'écran réel et **ne le crée à aucun moment** dans son historique. Il n'y a
> donc rien à publier de #95, et rien à en extraire.

### Où s'arrête l'ensemble

#97 est le **dernier** de la pile. Rien n'est prêt après lui : les forfaits, le
lien photo-devis, le SMS, la PWA et le reste ne sont pas commencés.

### Pourquoi pas plus petit

J'ai cherché à n'emporter que #94 et #96. Ce n'est pas possible proprement :

- **#96 dépend de #89 côté application.** Le geste « Prévenir le client » vit
  dans `AtelierCarte`, la fenêtre d'aperçu remplace `ConfirmationVehiculePret`,
  et la correction des alertes horaires modifie `echeanceCarte` — trois
  éléments **créés par #89**. Sans #89, #96 ne s'applique pas.
- **#94 est au milieu de la pile.** L'extraire seul demanderait de rebaser #96
  et #95 par-dessus, sur un `NexoraDashboard.jsx` qui a changé cinq fois.
  Un rebase à cet endroit produit des conflits dans un fichier de 8 300 lignes :
  le risque de la manipulation dépasse celui du contenu qu'elle éviterait.
- **#90, #91, #92** sont déjà recettés dans le navigateur, et #91 corrige une
  contradiction d'affichage. **#93** n'ajoute qu'un document.

### Pourquoi pas toute la pile

**#95 sort de l'ensemble** : c'est le prototype, il attend une revue visuelle.
Il est en bout de pile, il se détache donc sans rebaser quoi que ce soit.

> **Ce que ce découpage NE fait PAS** : il n'extrait aucune migration de son
> code applicatif. Les sept migrations partent avec l'écran qui les utilise.

---

## 2. Les migrations, dans l'ordre exact

Relevé sur la Production le 13 septembre — 99 migrations appliquées, la
dernière `20260917000100`. **Sept migrations en attente, dans cet ordre, et
aucune autre.** Rien n'a été appliqué.

| # | Fichier | Ce qu'elle fait | PR |
|---|---|---|---|
| 1 | `20260918000100_plaque_unique_par_garage.sql` | Remplace la contrainte globale par un index partiel `(garage_id, plaque normalisée)` + trigger de message | #94 |
| 2 | `20260918000200_import_plaque_par_garage.sql` | L'import cesse de rejeter « immatriculation non disponible » | #94 |
| 3 | `20260918000300_pret_nenvoie_rien.sql` | La notification naît `sans_lien` ; `autoriser_envoi_atelier`, `apercu_message_atelier`, `etat_envoi_atelier` | #96 |
| 4 | `20260918000400_reserver_atelier_destinataire.sql` | Garde de destinataire à la réservation | #96 |
| 5 | `20260918000500_empreinte_atelier.sql` | `empreinte_atelier` + enregistrement à l'autorisation + garde anti-empilement sur `bloque` | #96 |
| 6 | `20260918000600_reserver_atelier_empreinte.sql` | Garde complète à la réservation : message, destinataire, voiture plus prête | #96 |
| 7 | `20260918000700_etat_envoi_atelier_depuis.sql` | `etat_envoi_atelier` renvoie aussi **depuis quand** une notification est bloquée | #96 |

**Les sept sont indissociables** : 4, 5, 6 et 7 corrigent et complètent 3 ;
2 suppose 1. La 7 est ce qui permet à l'écran d'afficher la date d'un blocage
avant de proposer une revalidation — sans elle, #97 affiche un motif sans date.

Elles arrivent **après** `20260917000100`, dernière migration de la Production :
aucune collision d'horodatage.

### Vérification depuis le schéma de la Production

> Une comparaison de listes de migrations dit une seule chose : les fichiers
> sont là. Pas qu'ils s'appliquent, pas que ce qu'ils promettent tient. Les
> sept ont donc été **réellement appliquées**, puis éprouvées.

`docs/recette/base-jetable-2026-09-13.sh` — à rejouer tel quel :

1. **Schéma de la Production dumpé en lecture seule** (`supabase db dump
   --linked`) : 7 789 lignes.
2. **Base jetable** créée à partir de l'image officielle
   `supabase/postgres:17.6.1.166`, puis chargée avec ce schéma : **48 tables,
   111 fonctions, 79 policies, 35 triggers, zéro erreur**.
3. **Droits ramenés à l'état que la Production déclare.** Le dump porte
   `REVOKE ALL … FROM PUBLIC` mais pas les révocations par rôle, et l'image
   accorde par défaut l'exécution à `anon` et `authenticated` à la création de
   toute fonction publique. Sans cette étape, la copie paraîtrait plus ouverte
   que la Production — et le contrôle des droits mesurerait un artefact.
4. **Les sept migrations appliquées dans l'ordre : sept OK.**
5. **45 contrôles fonctionnels, 45 au vert**
   (`docs/recette/controles-base-jetable-2026-09-13.sql`).

| Bloc | Ce qui est vérifié | Résultat |
|---|---|---|
| A. Plaques | même plaque dans deux garages ; doublon dans le même garage, ponctuation ignorée ; le refus nomme la plaque **déjà enregistrée** ; véhicules sans plaque ; disparition de l'ancienne contrainte globale | 6/6 |
| B. « Prêt » n'envoie rien | naissance en `sans_lien` ; aucun destinataire validé ; **le traitement ne réserve rien** ; un aller-retour n'empile pas deux lignes | 4/4 |
| C. Autorisation | l'aperçu nomme le vrai destinataire et cite la plaque ; une autre adresse est refusée ; l'armement enregistre destinataire **et** empreinte ; double clic idempotent ; `depuis` présent ; client sans adresse ; voiture pas prête ; **mécanicien refusé** | 14/14 |
| D. Divergence | message changé / destinataire changé / voiture plus prête → trois motifs distincts, aucune des trois expédiée, **destinataire et empreinte validés non écrasés**, la ligne restée conforme part | 10/10 |
| E. Pas de reprise | un second passage ne reprend rien ; les lignes restent de côté ; un envoi en cours n'est jamais rejoué ; redevenir prête ne réarme pas ; la revalidation à la main réarme **la même** ligne | 7/7 |
| F. Droits | `reserver_notifications` reste fermée à `anon` et aux comptes connectés **après le remplacement par la migration 6** ; ouverte à `service_role` seul | 4/4 |

Deux écarts entre la copie et la Production, à connaître, aucun ne portant sur
le schéma `public` : le schéma `auth` est celui de l'image (le `public` n'en
utilise que `auth.uid()` et la clé de `auth.users`), et les données ne sont pas
copiées — les contrôles créent leur propre jeu d'essai.

La migration 1 **refuse de s'appliquer** s'il existe des plaques en double une
fois normalisées dans un même garage. Relevé en Production : **0 collision**.

#### Deux pièges du schéma de Production, rencontrés en montant le jeu d'essai

Ils ne changent rien à la publication, mais ils coûtent une heure à qui les
redécouvre :

- `vehicules.client_id` et `vehicules.garage_id` ont pour défaut
  `gen_random_uuid()`. Un insert qui les omet échoue sur une clé étrangère,
  avec un identifiant sorti de nulle part.
- `garages_owner_user_id_uniq` impose **un garage par propriétaire**, et
  `garage_membres_mecanicien_coherent` impose qu'un membre « mecanicien »
  pointe une fiche mécanicien.

---

## 3. L'ordre base / application

**Base d'abord, application ensuite.**

| Ordre | Ce qui se passe dans l'intervalle |
|---|---|
| **Migrations puis application** *(retenu)* | L'ancienne application marque une voiture prête → la notification naît `sans_lien` → **rien ne part**. Le garage perd la notification automatique pendant quelques minutes, sans le savoir. Conséquence bénigne, et c'est justement l'état visé. |
| Application puis migrations *(à éviter)* | Le nouvel écran appelle `autoriser_envoi_atelier`, qui n'existe pas encore → message d'erreur au comptoir. Et « Prêt » continue d'armer un envoi en silence. |

Le déploiement Vercel suit la fusion : appliquer les migrations **avant** de
fusionner, sur une fenêtre où personne ne travaille au comptoir.

---

## 4. Compatibilité avec les workflows actuels

**Aucun workflow n'est modifié, activé ni désactivé.**

| Workflow | Effet de cette publication |
|---|---|
| `Véhicule prêt (socle)` — **actif** | Continue d'appeler `reserver_notifications(p_file:'atelier')`, dont la **signature et le format de retour sont inchangés**. Il ne verra plus que des lignes explicitement autorisées. |
| `Nouveau devis (socle)`, `Facture (socle)`, `Proposition RDV` | Non touchés : les branches `devis`, `factures` et `proposition` de `reserver_notifications` sont reprises à l'identique. |
| Les autres | Ne lisent pas ces files. |

`reserver_notifications` est réécrite deux fois (migrations 4 et 6) mais
**seule la branche `atelier` change**. Les autres branches sont recopiées
octet pour octet depuis la définition en vigueur.

### Ce que le workflow reçoit en moins

Il ne recevra plus les lignes nées d'un simple changement d'étape. C'est
l'objet même du lot. Conséquence à assumer : **un garage qui comptait sur la
notification automatique devra désormais cliquer « Prévenir le client ».**

---

## 5. Les files de Production, relevées en lecture seule

| File | `en_attente` | `envoi_en_cours` | `bloque` | `envoye` |
|---|---|---|---|---|
| `notifications_atelier` | **0** | **0** | 3 | 1 |
| `notifications_devis` | **0** | **0** | 2 | 23 |
| `notifications_factures` | **0** | **0** | 0 | 1 |
| `notifications_proposition` | **0** | **0** | 0 | 2 |

**Aucune ligne armée nulle part.** La publication ne peut donc déclencher
aucun envoi au déploiement. Rien n'a été modifié.

### Les trois lignes `bloque` de l'atelier — à connaître

Elles datent des 23 août, 24 août et 5 septembre. Leurs trois véhicules sont
**encore notés `pret`**, avec une adresse e-mail valide.

Après publication, ces trois voitures apparaîtront dans la file « Prêtes »
avec un bouton **« Prévenir le client »**. Un clic enverrait un
« votre véhicule est prêt » pour un rendez-vous du 23 août — trois semaines
en retard.

Ce n'est **pas automatique** : il faut un clic, et l'aperçu montre le message
et le destinataire avant de confirmer. Mais c'est une surprise possible.

> **À décider par Baptiste avant publication** : restituer ces trois voitures
> (passer l'étape à `restitue`), ou laisser le garage juger sur pièce. Je n'ai
> rien modifié.

---

## 6. Retour arrière

### Côté application
`git revert` des fusions, ou redéploiement du commit précédent sur Vercel.
L'ancien écran fonctionne avec le nouveau schéma : il écrit `statut_atelier`
directement, ce que le trigger accepte toujours.

### Côté base

Script écrit, commenté et **éprouvé sur la copie du schéma de Production** :
`docs/recette/retour-arriere-2026-09-13.sql`.

> #### Un retour arrière ramène à un état sûr, pas à l'état précédent
>
> L'état précédent, c'était : marquer une voiture prête envoyait
> « Votre véhicule est prêt ! » au client dans les deux minutes, sans relecture
> et sans que personne ne voie le destinataire. **Le rétablir ferait partir en
> rafale tout ce qui aurait été marqué prêt depuis la publication.**
>
> `notifier_vehicule_pret` reste donc **désarmée** (`sans_lien`) dans tous les
> cas. Ce n'est pas un oubli du script : c'est sa règle. Une version
> antérieure de ce plan disait « rétablir `notifier_vehicule_pret` dans sa
> version `en_attente` » — **c'était faux et dangereux**, et c'est corrigé ici.
>
> Ce que ce choix coûte, et qu'il faut annoncer : application revenue en
> arrière + base désarmée = **les clients ne sont plus prévenus
> automatiquement**. Les lignes s'accumulent en `sans_lien`, restent lisibles,
> et repartent quand l'écran revient. Aucun message perdu, aucun message parti
> sans relecture.

| Migration | Réversible ? | Comment |
|---|---|---|
| 1 — plaque | **oui, sous condition** | Le script vérifie d'abord qu'aucune plaque n'est détenue par deux garages, et **refuse** sinon. Puis `drop trigger` / `drop function` / `drop index` / recréation de la contrainte globale. |
| 2 — import | oui | Rejouer la définition d'avant, depuis l'historique : `origin/main:supabase/migrations/20260910000100_…`. À ne faire **que si** la migration 1 est annulée aussi, sinon l'import devient plus strict que la table. |
| 3, 5 — prêt + empreinte | **partiellement, volontairement** | Colonnes et fonctions **conservées** : nullables, ignorées par l'ancien code, et elles portent ce que des garages ont réellement validé. `notifier_vehicule_pret` **n'est pas restaurée**. |
| 4, 6 — réservation | oui | Rejouer `origin/main:supabase/migrations/20260915000200_reservation_bornee_au_garage.sql`. `create or replace` conserve les droits : la fonction reste réservée à `service_role` — vérifié sur la copie. |

**Le point de non-retour est la migration 1**, et seulement à partir du moment
où un deuxième garage enregistre une plaque déjà présente ailleurs. Avec un
seul garage en Production, la fenêtre de réversibilité reste ouverte — et le
script le revérifie au moment de s'exécuter plutôt que de le supposer.

#### Éprouvé, pas seulement écrit

Joué sur la base jetable, après les sept migrations et les contrôles :

| Ce qui a été vérifié | Résultat |
|---|---|
| Une plaque partagée par deux garages | le script **refuse** et nomme le nombre de cas |
| Après traitement de la collision | les quatre étapes passent, contrainte globale recréée |
| `notifier_vehicule_pret` après retour arrière | **toujours désarmée** (`sans_lien`) |
| Les lignes en file | aucune ne bascule en `en_attente` du fait du retour arrière |

---

## 7. Ce qui a été vérifié, et comment

### Les six garanties demandées — 14 vérifications sur Test, toutes au vert

| Garantie | Vérification |
|---|---|
| Le **message** change après autorisation | bloqué, motif « le message a changé », rien n'est parti |
| Le **véhicule** change | bloqué, même motif |
| Le **destinataire** change | bloqué, motif distinct |
| Le **garage** change | couvert par l'empreinte (`garage_id` et `nom_garage` en font partie) |
| Le destinataire validé n'est **pas écrasé** | conservé tel quel sur une ligne bloquée |
| L'empreinte validée n'est **pas écrasée** | conservée |
| Voiture **plus prête** | bloquée, motif propre, aucun envoi |
| Ligne bloquée **ne se réarme pas seule** | vérifié : deux réservations successives ne la reprennent pas |
| Revalidation à la main | réarme **la même ligne**, pas une nouvelle |
| Un nouveau passage à Prêt ne double pas une ligne bloquée | 1 → 1 ligne |
| **Envoi en cours** jamais remis en file | ni réservé, ni rejoué, même si le message change entre-temps |
| Prêt **sans autorisation** | la réservation ne prend rien |
| Confirmation unique / double clic simultané | même ligne, `deja_autorise = true` des deux côtés |
| Droits des rôles | mécanicien refusé ; autre garage refusé sur l'aperçu **et** l'autorisation |

Jouées sous de vraies sessions authentifiées, et `reserver_notifications` sous
`service_role` — le rôle qu'utilise n8n, seul à en avoir le droit. Toutes les
réservations ont été **bornées au garage de recette** (leçon du 8 septembre :
les workflows ne filtrent pas par garage).

### Aperçu contre message réel

**22 comparaisons au caractère près, 0 écart** :
- les 15 rendez-vous du garage de recette, cas limites compris (véhicule sans
  plaque, sans marque, noms très longs) ;
- 7 cas construits : nom de garage avec guillemets, avec antislash, avec
  espaces en bord ; lien de paiement présent, puis réduit à des espaces ;
  client au nom vide ; client avec apostrophe.

> ### Limite structurelle, à ne pas présenter autrement
>
> **Deux compositions séparées subsistent** : le nœud « Construire le message »
> du workflow (JavaScript, dans n8n) et `apercu_message_atelier` (SQL, dans la
> base). Ce n'est **pas une source unique**.
>
> Elles coïncident aujourd'hui, c'est mesuré. Elles cesseront de coïncider le
> jour où l'une des deux sera modifiée sans l'autre, et **rien dans le produit
> ne le détectera** : le garage validerait alors un texte et le client en
> recevrait un autre.
>
> La suppression de cette limite demande de toucher à n8n — hors périmètre de
> ce lot. La plus petite forme : que le workflow lise le texte depuis
> `apercu_message_atelier` au lieu de le reconstruire. Le script de comparaison
> (`compare-apercu.mjs`) permet de vérifier la coïncidence avant chaque
> publication touchant au message.

---

## 8. Blocages réels

**Un seul, et il n'empêche pas de publier** : trois véhicules sont notés prêts
en Production depuis fin août ; publier fera apparaître un bouton « Prévenir le
client » pour eux, dont un clic enverrait un message trois semaines en retard.

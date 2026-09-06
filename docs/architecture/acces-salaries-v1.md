# Accès salariés et sécurité du dashboard — contrat V1

Établi le 2026-09-05 à partir d'un audit du schéma réel (projet Test
`slawilafseganlbghgwx`, catalogue Postgres en lecture seule) et des 44
migrations de `origin/main` au commit `5cf895f`. Aucune supposition : chaque
constat ci-dessous a été relevé en base ou dans une migration versionnée.

---

## A. Ce que le modèle actuel fait réellement

**Un garage = un utilisateur.** Il n'existe aucune notion de membre, de
salarié ou de rôle. L'appartenance est entièrement portée par
`garages.owner_user_id`, comparé à `auth.uid()`.

Deux formulations coexistent dans les policies, strictement équivalentes :

| Formulation | Tables concernées |
| --- | --- |
| `garage_id = current_garage_id()` | `actions_ia`, `clients`, `demandes`, `devis`, `factures`, `liste_attente`, `mecaniciens`, `notifications_atelier`, `prestations`, `propositions_rdv`, `rendez_vous`, `vehicules` |
| `garage_id in (select id from garages where owner_user_id = auth.uid())` | `devis_lignes`, `erreurs_automatisation`, `inspections*`, `opportunites_actions`, `ordres_reparation*`, `rappels_manques`, `revenue_recovery_*`, `travaux_differes*` |

`public.current_garage_id()` est `stable security definer`,
`set search_path = ''`, et vaut
`select id from public.garages where owner_user_id = auth.uid()`.

**La table `mecaniciens` n'est pas un compte.** Elle porte `nom`, `couleur`,
`actif` et sert d'étiquette d'affectation sur `rendez_vous.mecanicien_id` et
`ordres_reparation.mecanicien_id`. Aucune colonne ne la relie à
`auth.users` : un mécanicien, aujourd'hui, ne se connecte pas.

**RLS activée partout.** Les 43 tables de `public` ont
`relrowsecurity = true`. Treize d'entre elles n'ont aucune policy pour
`authenticated` — tables de jetons, `notifications_*`, `email_connections`,
`garages_secrets` — et sont donc en refus total côté client, accessibles
uniquement par des fonctions `security definer` ou par `service_role`.

**Les liens publics passent déjà par le bon mécanisme** : jeton haché en
base, RPC `security definer` avec `EXECUTE` révoqué de `public` puis
regrant explicite. C'est le patron à réutiliser, il est éprouvé.

**Point de vigilance relevé pendant l'audit, hors périmètre de ce
chantier** : `set_stripe_secret_key(text)`, `stripe_configure_pour_mon_garage()`
et `rls_auto_enable()` portent un `EXECUTE` accordé à `anon` et
`authenticated`. Aucune de ces fonctions n'entre dans le périmètre des rôles
salariés ; elles ne sont ni modifiées ni appelées ici, mais elles méritent un
examen séparé.

---

## B. Ce que le chantier ajoute

### B.1 Deux tables

`public.garage_membres` — l'appartenance et le rôle.

| Colonne | Rôle |
| --- | --- |
| `garage_id`, `user_id` | couple unique ; `user_id` référence `auth.users` |
| `role` | `dirigeant`, `accueil` ou `mecanicien`, contraint par CHECK |
| `mecanicien_id` | lien facultatif vers `mecaniciens`, obligatoire pour le rôle `mecanicien` |
| `actif`, `revoked_at` | révocation immédiate |
| `invite_par`, `created_at`, `updated_at` | traçabilité |

`public.garage_membres_historique` — journal append-only écrit par trigger :
`ajout`, `changement_role`, `revocation`, `reactivation`. Aucun droit
d'écriture direct, sur le modèle de `ordres_reparation_historique`.

### B.2 La résolution des droits, en un seul endroit

- `public.mon_role_garage(p_garage_id uuid) → text` : `dirigeant` si
  l'appelant est le propriétaire, sinon le rôle de son adhésion active,
  sinon `null`.
- `public.a_acces_garage(p_garage_id uuid, variadic p_roles text[]) → boolean` :
  le prédicat unique utilisé par toutes les policies et toutes les RPC.
- `public.current_garage_id()` est étendue à `propriétaire, puis dirigeant
  actif`, dans cet ordre déterministe. Le propriétaire garde exactement le
  comportement d'avant ; un dirigeant obtient la parité de droits voulue par
  l'énoncé, sans réécrire les quinze policies historiques.

Le rôle `accueil` et le rôle `mecanicien` ne passent **jamais** par
`current_garage_id()`. Ils n'obtiennent que ce qui leur est accordé
explicitement, table par table. C'est le refus par défaut.

### B.3 Ce que chaque rôle peut faire

| Domaine | Dirigeant | Accueil | Mécanicien |
| --- | --- | --- | --- |
| Clients, véhicules, rendez-vous, demandes, propositions | tout | tout | rien en direct |
| Devis et lignes de devis | tout | tout | rien |
| Contrôle véhicule (inspections, points, photos) | tout | tout | par RPC, sur son OR |
| Ordres de réparation et lignes | tout | tout | par RPC, ses OR seulement |
| Liste d'attente, travaux différés, rappels, suivi atelier | tout | tout | rien en direct |
| Prestations, mécaniciens | tout | lecture | rien |
| Factures | tout | **rien** | **rien** |
| Statistiques, réglages, garage | tout | **rien** | **rien** |
| Membres et accès | tout | **rien** | **rien** |
| Cockpit et relance commerciale | tout | **rien** | **rien** |

### B.4 Le mécanicien ne lit aucune table directement

Aucune policy ne lui est accordée. Sa seule surface est un jeu de quatre
fonctions `security definer` qui ne renvoient que les colonnes nécessaires
au travail d'atelier :

- `atelier_mes_ordres()` — ses OR affectés, non annulés : immatriculation,
  marque, modèle, nom du client, date du rendez-vous, statut, étape.
- `atelier_mon_ordre(p_ordre_id uuid)` — le détail d'un OR affecté, lignes
  comprises, **sans aucun prix** et **sans coordonnées client**.
- `atelier_marquer_ligne(p_ligne_id uuid, p_statut text)` — `prevu`, `fait`
  ou `annule` sur une ligne d'un OR affecté.
- `atelier_avancer_etape(p_rdv_id uuid, p_statut text)` — l'étape atelier
  d'un rendez-vous dont l'OR lui est affecté.

Chacune vérifie l'affectation à chaque appel : `ordres_reparation.mecanicien_id`
doit correspondre au `mecanicien_id` de l'adhésion active de l'appelant. Un
OR non affecté est indiscernable d'un OR inexistant.

Le choix du `security definer` plutôt qu'une policy restreinte est délibéré :
RLS filtre des lignes, jamais des colonnes. `ordres_reparation` porte
`notes_internes`, `ordres_reparation_lignes` porte `prix_unitaire_ht`, et
`clients` porte téléphone et e-mail. Une lecture directe, même limitée aux
bonnes lignes, exposerait ces colonnes.

### B.5 Les RPC de liens client deviennent conscientes du rôle

Six fonctions vérifiaient `garages.owner_user_id = auth.uid()` en dur, ce qui
aurait exclu un dirigeant tout autant qu'un salarié :
`creer_jeton_devis`, `revoquer_jeton_devis`, `creer_jeton_atelier`,
`revoquer_jeton_atelier`, `creer_jeton_inspection`,
`revoquer_jeton_inspection`. Elles passent à
`a_acces_garage(..., 'dirigeant', 'accueil')`. Corps et sémantique inchangés
par ailleurs.

`creer_jeton_facture` reste réservée au dirigeant : la facturation ne fait
pas partie du périmètre de l'accueil.

### B.6 Invitations : architecture posée, rien d'envoyé

`inviter_membre_garage(...)` n'accepte que l'identifiant d'un utilisateur
`auth.users` déjà existant, et crée l'adhésion. Aucun envoi d'e-mail, aucune
invitation Supabase Auth sortante, aucun appel externe. Le raccordement au
mécanisme d'invitation par e-mail est laissé explicitement en dehors de V1 et
demande un feu vert.

`revoquer_membre_garage(...)` pose `actif = false` et `revoked_at = now()`.
Comme chaque prédicat est réévalué à chaque requête, l'effet est immédiat
pour toute lecture et toute écriture ultérieure, sans attendre l'expiration
du jeton de session.

---

## C. Ce qui est explicitement hors périmètre

Aucune migration de données, aucun compte créé, aucun changement sur
Production, aucune modification du parcours client public, aucune reprise des
composants du dashboard au-delà de ce que la sécurité impose. Le masquage
d'onglets côté interface n'est jamais considéré comme une protection : il
suit les droits, il ne les crée pas.

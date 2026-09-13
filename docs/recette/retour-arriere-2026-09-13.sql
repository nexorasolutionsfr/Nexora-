-- Retour arrière des sept migrations du 18 septembre — sans jamais rétablir
-- l'envoi automatique au passage à « Prêt ».
--
-- ================================================================
-- LA RÈGLE QUI COMMANDE CE FICHIER
-- ================================================================
--
-- Un retour arrière sert à revenir à un état sûr, pas à l'état précédent.
--
-- L'état précédent, ici, c'était : marquer une voiture prête envoyait
-- « Votre véhicule est prêt ! » au client, dans les deux minutes, sans que
-- personne n'ait relu le message ni vu à qui il partait. Le rétablir ferait
-- partir en rafale tout ce qui aurait été marqué prêt depuis la publication.
--
-- Donc : `notifier_vehicule_pret` reste dans sa version désarmée. Ce n'est pas
-- un oubli. **Ne pas la « restaurer ».**
--
-- CE QUE COÛTE CE CHOIX, ET IL FAUT LE DIRE
--
-- Si l'application est revenue à sa version précédente, l'écran n'a plus de
-- bouton « Prévenir le client » — et la base, elle, n'arme plus rien toute
-- seule. Conséquence : **les clients ne sont plus prévenus automatiquement
-- que leur voiture est prête.** Les lignes s'accumulent en `sans_lien`, elles
-- restent lisibles, et repartiront quand l'écran reviendra. Aucun message
-- perdu, aucun message parti sans relecture. C'est le sens à donner au
-- retour arrière : on préfère un client qu'on appelle à un client à qui on
-- écrit n'importe quoi.
--
-- ================================================================
-- ORDRE : L'APPLICATION D'ABORD, LA BASE ENSUITE
-- ================================================================
--
--   1. Revenir à la version précédente de l'application (revert ou
--      redéploiement du commit antérieur). L'ancien écran écrit
--      `statut_atelier` directement : le trigger l'accepte toujours.
--   2. Puis ce fichier, dans l'ordre, en une seule transaction.
--
-- L'inverse laisserait le nouvel écran appeler des fonctions disparues.

begin;

-- ----------------------------------------------------------------
-- 1. Migration 600 et 400 — la réservation
-- ----------------------------------------------------------------
--
-- Ne rien écrire ici à la main : rejouer le fichier qui faisait foi avant,
-- tel quel, depuis l'historique.
--
--   git show origin/main:supabase/migrations/20260915000200_reservation_bornee_au_garage.sql | psql …
--
-- Il redonne à `reserver_notifications` sa définition d'avant le 18, sans le
-- garde-fou atelier. C'est sans danger : plus rien n'arrive en `en_attente`
-- sans passage par `autoriser_envoi_atelier`, et cette fonction-là reste.
--
-- `create or replace` conserve les droits : la fonction reste réservée à
-- `service_role`. Vérifié sur copie du schéma de Production le 13 septembre.

-- ----------------------------------------------------------------
-- 2. Migration 200 — l'import
-- ----------------------------------------------------------------
--
--   git show origin/main:supabase/migrations/20260910000100_reconcilier_acces_salaries_verrou_acces.sql
--
-- Attention : ce fichier ne contient pas que l'import. Si seul l'import doit
-- revenir, extraire la seule définition de `importer_clients_vehicules`.
--
-- À NE FAIRE QUE SI LA MIGRATION 100 EST AUSSI ANNULÉE : l'ancienne version
-- refuse une plaque déjà présente dans un autre garage. La laisser seule
-- rendrait l'import plus strict que la table.

-- ----------------------------------------------------------------
-- 3. Migration 100 — la plaque
-- ----------------------------------------------------------------
--
-- LE SEUL POINT DE NON-RETOUR DE L'ENSEMBLE. Il ne se referme qu'au moment
-- où un deuxième garage enregistre une plaque déjà détenue ailleurs : la
-- contrainte globale ne peut alors plus être recréée sans choisir quelle
-- fiche client supprimer. Ce choix appartient aux garages, pas à une
-- procédure de retour arrière.
--
-- Cette requête dit si la fenêtre est encore ouverte. Si elle renvoie des
-- lignes : NE PAS CONTINUER, et traiter le cas à la main.

do $$
declare v_collisions int;
begin
  select count(*) into v_collisions from (
    select upper(regexp_replace(immatriculation, '[^A-Za-z0-9]', '', 'g')) as plaque
      from public.vehicules
     where coalesce(immatriculation, '') <> ''
     group by 1 having count(distinct garage_id) > 1
  ) x;
  if v_collisions > 0 then
    raise exception 'Retour arrière impossible : % plaque(s) sont détenues par plusieurs garages. La contrainte globale ne peut pas être recréée sans supprimer des fiches. Traiter ces cas avant.', v_collisions;
  end if;
end $$;

drop trigger if exists vehicules_check_immatriculation_trigger on public.vehicules;
drop function if exists public.vehicules_check_immatriculation();
drop index if exists public.vehicules_immatriculation_unique_par_garage;

alter table public.vehicules
  add constraint vehicules_immatriculation_unique unique (immatriculation);

-- ----------------------------------------------------------------
-- 4. CE QU'ON NE TOUCHE PAS — et pourquoi
-- ----------------------------------------------------------------
--
-- `notifier_vehicule_pret` : RESTE désarmée (`sans_lien`). Voir l'en-tête.
--
-- `notifications_atelier.destinataire_valide` et `.empreinte_document` :
--   restent. Colonnes nullables, ignorées par l'ancien code. Les supprimer
--   effacerait ce que des garages ont réellement validé.
--
-- `autoriser_envoi_atelier`, `apercu_message_atelier`, `etat_envoi_atelier`,
-- `empreinte_atelier` : restent. Ce sont les seules portes vers un envoi ;
--   les supprimer ne rendrait rien plus sûr, et empêcherait de repartir.
--
-- Les lignes déjà en file : ne sont ni réécrites ni supprimées. Une ligne
--   `bloque` attend une décision humaine ; une ligne `envoi_en_cours` a
--   peut-être déjà été expédiée. Y toucher, c'est décider à la place du
--   garage — ou écrire deux fois au même client.

commit;

-- ================================================================
-- APRÈS : CE QU'IL FAUT VÉRIFIER
-- ================================================================
--
--   select statut, count(*) from notifications_atelier group by 1;
--
-- Attendu : aucune ligne ne doit être passée en `en_attente` du fait du
-- retour arrière. Si c'est le cas, quelque chose a rétabli l'armement
-- automatique — arrêter et revenir en arrière sur ce retour arrière.

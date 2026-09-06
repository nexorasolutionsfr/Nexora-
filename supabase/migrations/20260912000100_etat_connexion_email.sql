-- Dire la vérité sur l'état de la connexion e-mail.
--
-- CE QUI ÉTAIT FAUX
--
-- L'écran Paramètres affichait « Connectée » à partir du seul drapeau
-- `garages.gmail_connecte`, posé une fois au moment de l'autorisation et
-- jamais remis à jour ensuite. Constaté le 2026-09-06 : les deux connexions
-- affichaient « Connectée » alors que leurs jetons étaient expirés depuis le
-- 29 août et que plus rien n'avait été lu depuis sept à dix jours.
--
-- Pour un garage, c'est le pire des affichages : il croit que ses demandes
-- clients sont traitées, et personne ne le détrompe. Un indicateur qui ne
-- peut pas tenir sa promesse ne doit pas s'afficher comme s'il la tenait.
--
-- POURQUOI UNE FONCTION PLUTÔT QU'UNE LECTURE DIRECTE
--
-- `email_connections` porte des jetons OAuth en clair : RLS active, aucune
-- policy, lecture réservée à `service_role`. Le dashboard ne peut donc pas
-- la lire — et il ne le doit pas. Cette fonction en extrait le strict
-- nécessaire pour l'affichage : un booléen, une adresse, une date. Jamais
-- un jeton, ni `access_token`, ni `refresh_token`, ni `last_history_id`.
--
-- CE QUI SERT DE SIGNAL
--
-- `updated_at` est touché à chaque passage réussi du relevé Gmail, qui tourne
-- toutes les deux minutes. Au-delà d'une heure sans mise à jour, la chaîne ne
-- fonctionne plus, quelle qu'en soit la raison — jeton révoqué, relevé
-- arrêté, ou panne. C'est le signal honnête : ce qui compte pour le garage
-- n'est pas la cause, c'est que ses e-mails ne sont plus lus.
--
-- L'expiration de `token_expiry` ne conviendrait PAS comme signal : le jeton
-- d'accès dure une heure et est renouvelé en permanence, il est donc échu la
-- plupart du temps sans que rien n'aille mal.

create or replace function public.etat_connexion_email(p_garage_id uuid)
returns table (
  connectee         boolean,
  adresse           text,
  derniere_activite timestamptz,
  en_panne          boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (e.id is not null)                                                  as connectee,
    e.email_address                                                     as adresse,
    e.updated_at                                                        as derniere_activite,
    coalesce(e.updated_at < now() - interval '1 hour', false)           as en_panne
  from (select 1) as toujours_une_ligne
  left join public.email_connections e on e.garage_id = p_garage_id
  -- La garde est dans le WHERE : sans accès, la fonction ne renvoie aucune
  -- ligne, et l'appelant ne peut pas distinguer un refus d'une absence de
  -- connexion. C'est voulu — rien ne fuit sur l'existence d'un garage.
  where public.a_acces_garage(p_garage_id, 'dirigeant', 'accueil')
$$;

comment on function public.etat_connexion_email(uuid) is
  'État affichable de la connexion e-mail d''un garage : connectée ou non, adresse, dernière activité, et si la chaîne est en panne (plus d''une heure sans relevé). N''expose aucun jeton. Réservée aux rôles dirigeant et accueil du garage, via a_acces_garage, qui refuse aussi un garage à l''accès échu.';

revoke all on function public.etat_connexion_email(uuid) from public;
revoke all on function public.etat_connexion_email(uuid) from anon;
grant execute on function public.etat_connexion_email(uuid) to authenticated;

do $$
declare
  v_pb text := '';
begin
  if has_function_privilege('anon', 'public.etat_connexion_email(uuid)', 'EXECUTE') then
    v_pb := v_pb || E'\n- anon peut executer la fonction';
  end if;
  if not has_function_privilege('authenticated', 'public.etat_connexion_email(uuid)', 'EXECUTE') then
    v_pb := v_pb || E'\n- authenticated ne peut pas l''executer : le dashboard n''afficherait rien';
  end if;
  if pg_get_functiondef('public.etat_connexion_email(uuid)'::regprocedure) like '%access_token%'
     or pg_get_functiondef('public.etat_connexion_email(uuid)'::regprocedure) like '%refresh_token%' then
    v_pb := v_pb || E'\n- la fonction mentionne un jeton';
  end if;
  if v_pb <> '' then
    raise exception 'Etat vise non atteint : %', v_pb;
  end if;
  raise notice 'etat_connexion_email : etat verifie';
end;
$$;

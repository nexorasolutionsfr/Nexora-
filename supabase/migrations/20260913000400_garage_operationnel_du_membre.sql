-- Rendre au salarié les réglages dont son écran a besoin — et rien de plus.
--
-- CE QUI A ÉTÉ CONSTATÉ
--
-- 20260913000300 a retiré la policy qui donnait au salarié sa ligne `garages`
-- entière. Bien. Mais le corps du tableau de bord lit encore cette table pour
-- afficher le nom du garage, ses horaires et ses réglages de notification.
-- Résultat observé en interface sur Test, compte accueil : l'écran s'ouvre sur
-- le bon garage, lit ses clients… et affiche « Garage Demo Nexora » avec des
-- horaires de démonstration, valeurs de repli codées en dur.
--
-- Ce n'est pas une fuite, c'est un mensonge d'affichage. Un salarié qui voit
-- des horaires qui ne sont pas ceux de son garage prend des rendez-vous faux.
--
-- QUI PEUT APPELER, ET POURQUOI CE N'EST PAS « TOUT MEMBRE ACTIF »
--
-- La première écriture de cette fonction se contentait de vérifier une
-- adhésion active. Deux défauts, tous deux corrigés ici.
--
-- 1. **L'échéance n'était pas contrôlée.** Le verrou 20260909000900 ferme
--    toutes les tables du garage quand son accès est échu ; cette fonction,
--    `security definer`, serait passée à travers et aurait continué à servir
--    les réglages d'un garage dont le mois offert est terminé. On appelle donc
--    `a_acces_garage()`, le prédicat unique des policies et des RPC depuis la
--    réconciliation 20260910000100 : il exige à la fois le rôle **et**
--    `acces_garage_ouvert()`. Une seule règle, écrite à un seul endroit.
--
-- 2. **Les champs ont été choisis à partir des écrans de l'accueil.** Les
--    donner au mécanicien serait les lui donner sans raison : son écran
--    (`AtelierMecanicienScreen`) n'affiche ni horaires, ni canaux de
--    notification, ni adresse — il ne lit aucun de ces champs, et n'appelle
--    même pas cette fonction. Le nom de son garage, s'il en avait besoin un
--    jour, lui vient déjà de `mes_adhesions()`. La fonction est donc réservée
--    au dirigeant et à l'accueil ; le jour où la surface du mécanicien
--    s'élargira, elle recevra sa propre projection, plus étroite.
--
-- Un appelant sans droit — mécanicien, adhésion révoquée, garage échu, garage
-- inconnu — reçoit zéro ligne, sans distinguer ces cas entre eux.
--
-- CE QUE LA FONCTION REND, ET CE QU'ELLE TAIT
--
-- Les douze champs que les écrans ouverts à l'accueil affichent réellement,
-- relevés un par un dans `components/NexoraDashboard.jsx`. Restent dehors :
-- `owner_user_id`, `siren`, `tva_sur_les_debits`, `objectif_ca_mensuel`,
-- `lien_avis_google`, `numero_whatsapp`, `dernier_numero_facture`,
-- `gmail_connecte`, `gmail_adresse`, `stripe_customer_id`,
-- `stripe_subscription_id` et toute la famille `abonnement_*` / `acces_*`
-- (celle-ci passe par `mes_adhesions()`, qui décide de l'ouverture et doit
-- rester lisible même accès fermé — sans quoi l'écran « votre accès est
-- terminé » n'aurait rien à afficher).
--
-- Le propriétaire n'est pas concerné en pratique : sa policy `owner_user_id`
-- lui donne sa ligne entière, et l'application continue de la lire pour lui.

create or replace function public.mon_garage_operationnel(p_garage_id uuid)
returns table (
  id uuid,
  nom_garage text,
  adresse text,
  telephone text,
  email text,
  horaires jsonb,
  theme text,
  modules_actifs jsonb,
  profil_activite text,
  canaux_notifications jsonb,
  rappel_confirmation_actif boolean,
  delai_confirmation_rdv_h integer,
  automatisation_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.a_acces_garage(p_garage_id, 'dirigeant', 'accueil') then
    return;
  end if;

  return query
    select g.id,
           g.nom_garage,
           g.adresse,
           g.telephone,
           g.email,
           g.horaires,
           g.theme,
           g.modules_actifs,
           g.profil_activite,
           g.canaux_notifications,
           g.rappel_confirmation_actif,
           g.delai_confirmation_rdv_h,
           g.automatisation_active
    from public.garages g
    where g.id = p_garage_id;
end;
$$;

comment on function public.mon_garage_operationnel(uuid) is
  'Les réglages du garage qu''un salarié voit à l''écran : identité affichée, horaires, notifications. Réservée au dirigeant et à l''accueil, et soumise au verrou d''accès par a_acces_garage() — un garage échu ne sert plus rien. Projection explicite : ni identifiants de facturation, ni SIREN, ni objectif de chiffre d''affaires, ni propriétaire. Ajoutée le 2026-09-13 : sans elle, 20260913000300 laissait le salarié devant des horaires de démonstration.';

revoke execute on function public.mon_garage_operationnel(uuid) from public, anon, service_role;
grant execute on function public.mon_garage_operationnel(uuid) to authenticated;

do $$
declare
  v_pb text := '';
  v_corps text;
begin
  if to_regprocedure('public.mon_garage_operationnel(uuid)') is null then
    v_pb := v_pb || E'\n- la fonction est absente';
  else
    select p.prosrc into v_corps
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'mon_garage_operationnel';

    -- Le contrôle d'accès doit passer par le prédicat unique, jamais par une
    -- copie locale de la règle : deux définitions de « l'accès est ouvert »
    -- finissent par diverger.
    if position('a_acces_garage' in coalesce(v_corps, '')) = 0 then
      v_pb := v_pb || E'\n- le corps n''appelle pas a_acces_garage()';
    end if;
    if position('mecanicien' in coalesce(v_corps, '')) > 0 then
      v_pb := v_pb || E'\n- le role mecanicien est admis alors que ses ecrans ne lisent aucun de ces champs';
    end if;
  end if;

  if exists (
    select 1
    from information_schema.parameters p
    where p.specific_schema = 'public'
      and p.parameter_mode = 'OUT'
      and p.parameter_name in ('owner_user_id', 'siren', 'objectif_ca_mensuel',
                               'stripe_customer_id', 'stripe_subscription_id',
                               'dernier_numero_facture', 'gmail_adresse')
      and p.specific_name like 'mon_garage_operationnel%'
  ) then
    v_pb := v_pb || E'\n- la projection contient une colonne exclue';
  end if;

  -- La policy refermée par 000300 ne doit pas être revenue par la fenêtre.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages'
      and policyname = 'garages_membre_select'
  ) then
    v_pb := v_pb || E'\n- la policy trop large est reapparue';
  end if;

  if to_regprocedure('public.a_acces_garage(uuid, text[])') is null then
    v_pb := v_pb || E'\n- a_acces_garage(uuid, text[]) est absente';
  end if;

  if v_pb <> '' then
    raise exception 'Migration 20260913000400 incomplete : %', v_pb;
  end if;
  raise notice 'Reglages operationnels : dirigeant et accueil seulement, sous verrou d acces';
end;
$$;

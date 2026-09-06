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
-- CE QUE CETTE FONCTION REND, ET CE QU'ELLE TAIT
--
-- Les douze champs que les écrans ouverts à l'accueil affichent réellement,
-- relevés un par un dans `components/NexoraDashboard.jsx`. Restent dehors,
-- parce qu'aucun écran accessible à un salarié ne les lit :
-- `owner_user_id`, `siren`, `tva_sur_les_debits`, `objectif_ca_mensuel`,
-- `lien_avis_google`, `numero_whatsapp`, `dernier_numero_facture`,
-- `gmail_connecte`, `gmail_adresse`, `stripe_customer_id`,
-- `stripe_subscription_id` et toute la famille `abonnement_*` / `acces_*`
-- (celle-ci passe déjà par `mes_adhesions()`, qui décide de l'ouverture).
--
-- Le propriétaire n'est pas concerné : sa policy `owner_user_id` lui donne sa
-- ligne entière, et l'application continue de la lire pour lui.

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
  -- Une adhésion active suffit, quel que soit le rôle : ces réglages sont ce
  -- que l'atelier a sous les yeux toute la journée. Un garage inconnu et un
  -- garage auquel l'appelant n'appartient pas donnent le même résultat vide,
  -- sans distinguer les deux.
  if not exists (
    select 1
    from public.garage_membres m
    where m.garage_id = p_garage_id
      and m.user_id = auth.uid()
      and m.actif = true
      and m.revoked_at is null
  ) then
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
  'Les réglages du garage qu''un salarié voit à l''écran : identité affichée, horaires, notifications. Projection explicite — ni identifiants de facturation, ni SIREN, ni objectif de chiffre d''affaires, ni propriétaire. Ajoutée le 2026-09-13 : sans elle, 20260913000300 laissait le salarié devant des horaires de démonstration.';

revoke execute on function public.mon_garage_operationnel(uuid) from public, anon, service_role;
grant execute on function public.mon_garage_operationnel(uuid) to authenticated;

do $$
declare
  v_pb text := '';
begin
  if to_regprocedure('public.mon_garage_operationnel(uuid)') is null then
    v_pb := v_pb || E'\n- la fonction est absente';
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

  if v_pb <> '' then
    raise exception 'Migration 20260913000400 incomplete : %', v_pb;
  end if;
  raise notice 'Reglages operationnels du membre exposes, sans les colonnes sensibles';
end;
$$;

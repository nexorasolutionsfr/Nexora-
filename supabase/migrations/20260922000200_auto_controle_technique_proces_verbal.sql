-- Nexora Auto — lot A, correction de revue : le procès-verbal fait foi.
--
-- Revue du 16 septembre 2026 sur le calcul du contrôle technique :
--
-- a. Après un contrôle, la date limite inscrite sur le procès-verbal prime
--    sur tout calcul. `controle_valable_jusqu_au` la recueille.
-- b. Une contre-visite ne doit jamais produire une échéance à deux ans.
--    `resultat_controle` distingue « favorable » et « contre_visite » ;
--    NULL = non précisé, traité comme une estimation.
-- c. Ces deux informations n'existent que pour un contrôle technique.
--
-- `auto_ajouter_vehicule` reçoit la date du procès-verbal. Son ancienne
-- signature (20260922000100) n'a jamais existé qu'en Test : elle est retirée
-- plutôt que laissée en double.
--
-- Retour arrière : supprimer les deux colonnes et leurs contraintes, recréer
-- la fonction telle que dans 20260922000100.

alter table public.auto_historique
  add column if not exists resultat_controle text,
  add column if not exists controle_valable_jusqu_au date;

alter table public.auto_historique drop constraint if exists auto_historique_resultat_controle_valide;
alter table public.auto_historique add constraint auto_historique_resultat_controle_valide
  check (resultat_controle is null or resultat_controle in ('favorable', 'contre_visite'));

alter table public.auto_historique drop constraint if exists auto_historique_controle_seulement;
alter table public.auto_historique add constraint auto_historique_controle_seulement
  check (type = 'controle_technique' or (resultat_controle is null and controle_valable_jusqu_au is null));

alter table public.auto_historique drop constraint if exists auto_historique_validite_apres_controle;
alter table public.auto_historique add constraint auto_historique_validite_apres_controle
  check (controle_valable_jusqu_au is null or controle_valable_jusqu_au > realise_le);

comment on column public.auto_historique.controle_valable_jusqu_au is
  'Contrôle technique seulement : date limite du prochain contrôle inscrite sur le procès-verbal. Prime sur tout calcul.';
comment on column public.auto_historique.resultat_controle is
  'Contrôle technique seulement : favorable ou contre_visite. NULL = non précisé. Une contre-visite ne donne jamais d''échéance à deux ans.';

drop function if exists public.auto_ajouter_vehicule(text, text, integer, text, text, date, integer, date);

create or replace function public.auto_ajouter_vehicule(
  p_marque text,
  p_modele text,
  p_annee integer default null,
  p_energie text default null,
  p_immatriculation text default null,
  p_date_mise_en_circulation date default null,
  p_kilometrage integer default null,
  p_dernier_controle date default null,
  p_controle_valable_jusqu_au date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'auto_ajouter_vehicule : session requise';
  end if;
  -- La date du procès-verbal se rattache à un contrôle : sans la date du
  -- contrôle, elle n'aurait pas de ligne où vivre.
  if p_controle_valable_jusqu_au is not null and p_dernier_controle is null then
    raise exception using errcode = '22023', message = 'auto_ajouter_vehicule : date du procès-verbal sans date de contrôle (auto_controle_incomplet)';
  end if;

  insert into public.auto_vehicules (marque, modele, annee, energie, immatriculation, date_mise_en_circulation)
  values (btrim(p_marque), btrim(p_modele), p_annee, nullif(btrim(p_energie), ''),
          nullif(btrim(p_immatriculation), ''), p_date_mise_en_circulation)
  returning id into v_id;

  if p_kilometrage is not null then
    insert into public.auto_releves_km (vehicule_id, kilometrage) values (v_id, p_kilometrage);
  end if;

  if p_dernier_controle is not null then
    insert into public.auto_historique (vehicule_id, type, realise_le, controle_valable_jusqu_au)
    values (v_id, 'controle_technique', p_dernier_controle, p_controle_valable_jusqu_au);
  end if;

  return v_id;
end;
$$;

revoke all on function public.auto_ajouter_vehicule(text, text, integer, text, text, date, integer, date, date) from public, anon;
grant execute on function public.auto_ajouter_vehicule(text, text, integer, text, text, date, integer, date, date) to authenticated;

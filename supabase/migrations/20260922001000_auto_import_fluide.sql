-- Nexora Auto — lot H : import des documents plus fluide.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- a. Deux confirmations simultanées ne comptent jamais deux dépenses.
--    Constaté sur Test (scripts/recette/factures/concurrence.mjs) : deux
--    fichiers différents de la même facture (le PDF et une photo), confirmés
--    au même moment avec la même date et le même montant, créaient deux
--    interventions dans 16 cas sur 20 : chaque appel vérifiait la
--    ressemblance avant que l'autre n'ait écrit. Le verrou de la ligne du
--    document ne protégeait que la MÊME facture.
--    Correction : `auto_enregistrer_facture` prend un verrou transactionnel
--    par voiture avant de chercher une intervention ressemblante. Le second
--    appel attend la fin du premier, puis reçoit « intervention ressemblante »
--    et la personne choisit. Rien d'autre ne change dans la fonction.
--
-- b. Corriger une intervention après confirmation. Le titre donné
--    automatiquement à la facture (« Facture <professionnel> ») suit une
--    correction du professionnel ; un titre choisi par la personne n'est
--    jamais touché. Déclencheur `auto_historique_titre_documents`.
--    Le reste se déduit déjà de l'historique à chaque affichage (dépenses,
--    kilométrage, « À prévoir ») : aucune donnée dérivée à recalculer.
--
-- ================================================================
-- 2. DROITS
-- ================================================================
--
-- Inchangés. La fonction garde les droits de la personne (RLS). Le
-- déclencheur agit avec les droits de qui modifie l'intervention : seulement
-- les documents qu'elle peut déjà modifier. Sa fonction n'est exécutable
-- par personne directement.
--
-- ================================================================
-- 3. RETOUR ARRIÈRE
-- ================================================================
--
-- Recréer auto_enregistrer_facture depuis 20260922000900_auto_factures.sql
-- (sans la ligne pg_advisory_xact_lock), puis :
--   drop trigger if exists auto_historique_titre_documents on public.auto_historique;
--   drop function if exists public.auto_historique_titre_documents();
-- Aucune donnée à reprendre.

-- ----------------------------------------------------------------
-- a. Confirmer une facture : une confirmation à la fois par voiture
-- ----------------------------------------------------------------

create or replace function public.auto_enregistrer_facture(
  p_document_id uuid,
  p_rattacher_a uuid,
  p_realise_le date,
  p_date_facture date,
  p_type text,
  p_operations jsonb,
  p_prestataire text,
  p_kilometrage integer,
  p_montant_ttc numeric,
  p_libelle text,
  p_creer_malgre_ressemblance boolean default false,
  p_lecture_id uuid default null,
  p_corrections text[] default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_document record;
  v_historique uuid;
  v_montant numeric(10,2) := round(p_montant_ttc, 2);
begin
  -- Droits de la personne : un document d'une autre personne est introuvable.
  select d.id, d.vehicule_id, d.historique_id into v_document
  from public.auto_documents d
  where d.id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'auto_facture : document introuvable (auto_document_introuvable)';
  end if;
  if v_document.historique_id is not null then
    raise exception using errcode = '23505', message = 'auto_facture : facture déjà enregistrée (auto_facture_deja_enregistree)';
  end if;

  -- Une confirmation à la fois par voiture : deux fichiers de la même facture
  -- confirmés en même temps (deux appareils, deux onglets) ne créent jamais
  -- deux interventions. Le second appel attend, puis voit la première.
  perform pg_advisory_xact_lock(hashtextextended('auto_facture:' || v_document.vehicule_id::text, 0));

  if p_rattacher_a is not null then
    -- Rattacher : la facture justifie une intervention existante, qui n'est
    -- pas modifiée.
    select h.id into v_historique
    from public.auto_historique h
    where h.id = p_rattacher_a and h.vehicule_id = v_document.vehicule_id;
    if v_historique is null then
      raise exception using errcode = 'P0002', message = 'auto_facture : intervention introuvable pour cette voiture (auto_intervention_introuvable)';
    end if;
  else
    if p_realise_le is null or p_type is null then
      raise exception using errcode = '23514', message = 'auto_facture : date et type d''intervention requis (auto_facture_incomplete)';
    end if;
    if not coalesce(p_creer_malgre_ressemblance, false) and exists (
      select 1 from public.auto_historique h
      where h.vehicule_id = v_document.vehicule_id
        and h.realise_le = p_realise_le
        and case
              when v_montant is not null and h.montant_ttc is not null then h.montant_ttc = v_montant
              else h.type = p_type
            end
    ) then
      raise exception using errcode = '23514', message = 'auto_facture : intervention ressemblante à trancher (auto_doublon_potentiel)';
    end if;

    insert into public.auto_historique (vehicule_id, type, realise_le, kilometrage, libelle, prestataire, montant_ttc, saisie, operations)
    values (
      v_document.vehicule_id, p_type, p_realise_le, p_kilometrage,
      nullif(btrim(p_libelle), ''), nullif(btrim(p_prestataire), ''), v_montant, 'document',
      case when jsonb_typeof(p_operations) = 'array' and jsonb_array_length(p_operations) = 0 then null else p_operations end
    )
    returning id into v_historique;
  end if;

  -- Titre lisible dans la liste des documents, s'il n'en a pas déjà un.
  update public.auto_documents d
  set historique_id = v_historique,
      type = 'facture',
      date_document = coalesce(p_date_facture, d.date_document),
      titre = coalesce(d.titre, (
        select left('Facture ' || h.prestataire, 120) from public.auto_historique h
        where h.id = v_historique and nullif(btrim(h.prestataire), '') is not null
      ))
  where d.id = v_document.id;

  if p_lecture_id is not null then
    update public.auto_lectures
    set confirmee_le = now(), corrections = p_corrections
    where id = p_lecture_id and document_id = v_document.id;
  end if;

  return v_historique;
end;
$$;

revoke execute on function public.auto_enregistrer_facture(uuid, uuid, date, date, text, jsonb, text, integer, numeric, text, boolean, uuid, text[]) from public, anon;
grant execute on function public.auto_enregistrer_facture(uuid, uuid, date, date, text, jsonb, text, integer, numeric, text, boolean, uuid, text[]) to authenticated, service_role;

-- ----------------------------------------------------------------
-- b. Le titre automatique d'une facture suit la correction du professionnel
-- ----------------------------------------------------------------

create or replace function public.auto_historique_titre_documents()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.auto_documents d
  set titre = case
                when nullif(btrim(new.prestataire), '') is null then null
                else left('Facture ' || new.prestataire, 120)
              end
  where d.historique_id = new.id
    and d.titre = left('Facture ' || old.prestataire, 120);
  return new;
end;
$$;

revoke execute on function public.auto_historique_titre_documents() from public, anon, authenticated, service_role;

drop trigger if exists auto_historique_titre_documents on public.auto_historique;
create trigger auto_historique_titre_documents
  after update of prestataire on public.auto_historique
  for each row
  when (old.prestataire is distinct from new.prestataire and nullif(btrim(old.prestataire), '') is not null)
  execute function public.auto_historique_titre_documents();

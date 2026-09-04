-- Accès salariés V1 — 4/6 : la surface du mécanicien.
--
-- Le mécanicien n'obtient AUCUNE policy. Il ne peut lire aucune table
-- directement : `a_acces_garage(..., 'mecanicien')` n'apparaît nulle part
-- dans la migration 3, et `current_garage_id()` ne le résout pas. Sa seule
-- porte d'entrée est ce jeu de quatre fonctions.
--
-- Pourquoi des fonctions et pas des policies restreintes : RLS filtre des
-- lignes, jamais des colonnes. Même limitée aux bons ordres de réparation,
-- une lecture directe exposerait `ordres_reparation.notes_internes`,
-- `ordres_reparation_lignes.prix_unitaire_ht` et, par jointure,
-- `clients.email` et `clients.telephone`. Les fonctions ci-dessous
-- projettent explicitement les colonnes autorisées et rien d'autre.
--
-- Chaque fonction revérifie l'affectation à chaque appel, contre l'adhésion
-- active de l'appelant. Un ordre non affecté est traité exactement comme un
-- ordre inexistant : même message, aucune fuite d'existence.
--
-- Voir docs/architecture/acces-salaries-v1.md, section B.4.

-- Fiche mecaniciens de l'appelant sur ce garage, si et seulement si son
-- adhésion active porte le rôle mecanicien. Sert de critère unique à toutes
-- les fonctions ci-dessous.
create function public.mon_mecanicien_id(p_garage_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.mecanicien_id
  from public.garage_membres m
  where m.garage_id = p_garage_id
    and m.user_id = auth.uid()
    and m.role = 'mecanicien'
    and m.actif = true
    and m.revoked_at is null
  limit 1
$$;

comment on function public.mon_mecanicien_id(uuid) is
  'Fiche mecaniciens rattachée à l''adhésion active de l''appelant sur ce garage, uniquement pour le rôle mecanicien. NULL sinon, y compris pour un dirigeant ou un accueil.';

-- --- Lecture : la liste de travail ------------------------------------------

create function public.atelier_mes_ordres()
returns table (
  ordre_id uuid,
  statut text,
  etape_atelier text,
  date_debut timestamptz,
  immatriculation text,
  marque text,
  modele text,
  client_nom text,
  nb_lignes bigint,
  nb_lignes_faites bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id,
         o.statut,
         rv.statut_atelier,
         rv.date_debut,
         v.immatriculation,
         v.marque,
         v.modele,
         c.nom,
         (select count(*) from public.ordres_reparation_lignes l
           where l.ordre_reparation_id = o.id and l.statut <> 'annule'),
         (select count(*) from public.ordres_reparation_lignes l
           where l.ordre_reparation_id = o.id and l.statut = 'fait')
  from public.ordres_reparation o
  join public.rendez_vous rv on rv.id = o.rendez_vous_id
  join public.vehicules v on v.id = o.vehicule_id
  join public.clients c on c.id = o.client_id
  where o.mecanicien_id is not null
    and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
    and o.statut <> 'annule'
  order by rv.date_debut nulls last, o.created_at
$$;

comment on function public.atelier_mes_ordres() is
  'Ordres de réparation affectés au mécanicien appelant, hors annulés. Ne renvoie que le nom du client (jamais son téléphone ni son e-mail), jamais de prix, jamais les notes internes.';

-- --- Lecture : le détail d'un ordre affecté ---------------------------------

create function public.atelier_mon_ordre(p_ordre_id uuid)
returns table (
  ligne_id uuid,
  type text,
  libelle text,
  quantite numeric,
  duree_minutes integer,
  statut text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1
    from public.ordres_reparation o
    where o.id = p_ordre_id
      and o.mecanicien_id is not null
      and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
      and o.statut <> 'annule'
  ) into v_ok;

  if not v_ok then
    raise exception 'Ordre de réparation introuvable ou accès refusé';
  end if;

  return query
    select l.id, l.type, l.libelle, l.quantite, l.duree_minutes, l.statut
    from public.ordres_reparation_lignes l
    where l.ordre_reparation_id = p_ordre_id
    order by l.created_at, l.id;
end;
$$;

comment on function public.atelier_mon_ordre(uuid) is
  'Lignes d''un ordre affecté au mécanicien appelant. La colonne prix_unitaire_ht est volontairement absente de la projection : un mécanicien ne voit aucun montant.';

-- --- Écriture : avancement du travail ---------------------------------------

create function public.atelier_marquer_ligne(p_ligne_id uuid, p_statut text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ordre_id uuid;
begin
  if p_statut is null or p_statut not in ('prevu', 'fait', 'annule') then
    raise exception 'Statut de ligne invalide';
  end if;

  select l.ordre_reparation_id into v_ordre_id
  from public.ordres_reparation_lignes l
  join public.ordres_reparation o on o.id = l.ordre_reparation_id
  where l.id = p_ligne_id
    and o.mecanicien_id is not null
    and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
    and o.statut not in ('annule', 'termine')
  for update of l;

  if v_ordre_id is null then
    raise exception 'Ligne introuvable ou accès refusé';
  end if;

  update public.ordres_reparation_lignes
    set statut = p_statut
    where id = p_ligne_id;

  return true;
end;
$$;

comment on function public.atelier_marquer_ligne(uuid, text) is
  'Marque une ligne d''un ordre affecté. Refusée si l''ordre est annulé ou déjà terminé : un mécanicien ne rouvre pas un ordre clos.';

create function public.atelier_avancer_etape(p_rdv_id uuid, p_statut text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garage_id uuid;
begin
  -- Étapes réellement utilisées par le tableau Atelier et le dossier
  -- véhicule. `restitue` en est volontairement exclu : la restitution
  -- ouvre la facturation, elle relève de l'accueil ou du dirigeant.
  if p_statut is null or p_statut not in
    ('a_venir', 'depose', 'diagnostic', 'attente_piece', 'attente_client', 'intervention', 'pret')
  then
    raise exception 'Étape atelier invalide';
  end if;

  select rv.garage_id into v_garage_id
  from public.rendez_vous rv
  join public.ordres_reparation o on o.rendez_vous_id = rv.id
  where rv.id = p_rdv_id
    and o.mecanicien_id is not null
    and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
    and o.statut <> 'annule'
  for update of rv;

  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable ou accès refusé';
  end if;

  update public.rendez_vous
    set statut_atelier = p_statut
    where id = p_rdv_id;

  return true;
end;
$$;

comment on function public.atelier_avancer_etape(uuid, text) is
  'Change l''étape atelier d''un rendez-vous dont l''ordre de réparation est affecté à l''appelant. Ne permet pas de passer à restitue : cette transition ouvre la facturation et reste à l''accueil ou au dirigeant.';

-- Refus par défaut, puis regrant minimal au seul rôle qui appelle.
revoke execute on function public.mon_mecanicien_id(uuid) from public;
revoke execute on function public.atelier_mes_ordres() from public;
revoke execute on function public.atelier_mon_ordre(uuid) from public;
revoke execute on function public.atelier_marquer_ligne(uuid, text) from public;
revoke execute on function public.atelier_avancer_etape(uuid, text) from public;

grant execute on function public.mon_mecanicien_id(uuid) to authenticated;
grant execute on function public.atelier_mes_ordres() to authenticated;
grant execute on function public.atelier_mon_ordre(uuid) to authenticated;
grant execute on function public.atelier_marquer_ligne(uuid, text) to authenticated;
grant execute on function public.atelier_avancer_etape(uuid, text) to authenticated;

-- Pourquoi ce garage a-t-il accès, et jusqu'à quand.
--
-- CE QUI MANQUAIT
--
-- Trois états commerciaux existent : l'essai de quatorze jours, l'abonnement
-- payé, et le mois offert aux dix premiers garages. La base n'en connaissait
-- que deux.
--
--   essai      → `essai_fin`, posé par creer_mon_garage. Fonctionne.
--   abonnement → `abonnement_actif`, écrit par le webhook Stripe. Fonctionne.
--   pilote     → RIEN. La colonne `pilote_debut` existe depuis longtemps mais
--                aucune fonction ne la lit, aucune policy ne l'utilise, et
--                aucun garage ne la renseigne. Le mois offert n'était nulle
--                part.
--
-- Et un quatrième état existait sans avoir été décidé : `essai_fin` à NULL
-- vaut **accès sans limite**. Les garages créés avant 20260909000300 sont dans
-- cet état, c'est-à-dire gratuits à vie sans que rien ne le dise.
--
-- On remplace donc « déduire l'accès de deux colonnes et d'un NULL » par
-- « lire le motif ». `acces_motif` dit pourquoi, `acces_fin` dit jusqu'à quand.
--
-- LE POINT DÉLICAT : L'ORDRE DE DÉPLOIEMENT
--
-- Une migration fusionnée est appliquée en Production immédiatement, alors que
-- le nouveau code de l'interface arrive quelques minutes plus tard avec le
-- déploiement Vercel. Pendant cette fenêtre, l'ancienne interface tourne
-- contre la nouvelle base.
--
-- `essai_fin` n'est donc NI supprimée NI renommée. Elle est conservée et tenue
-- à jour par un trigger, pour que l'interface encore déployée continue de
-- fonctionner. Elle deviendra supprimable quand plus rien ne la lira — c'est
-- un lot à part, et il ne se fait pas le même jour.
--
-- LE SENS DE LA RÈGLE : FERMÉ PAR DÉFAUT
--
-- Un garage sans motif n'a pas accès. C'est volontaire : sur un contrôle
-- d'accès, l'oubli doit fermer, jamais ouvrir. Le bloc de vérification en fin
-- de migration s'assure qu'aucun garage existant ne se retrouve fermé par ce
-- changement.

begin;

alter table public.garages
  add column if not exists acces_motif text,
  add column if not exists acces_fin   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'garages_acces_motif_connu') then
    alter table public.garages add constraint garages_acces_motif_connu
      check (acces_motif is null or acces_motif in ('essai', 'pilote', 'abonnement', 'illimite'));
  end if;

  -- Un accès à durée doit porter sa date, et un accès sans limite ne doit pas
  -- en porter : sans cette contrainte, « illimite » avec une date passée
  -- deviendrait indéchiffrable six mois plus tard.
  if not exists (select 1 from pg_constraint where conname = 'garages_acces_fin_coherente') then
    alter table public.garages add constraint garages_acces_fin_coherente
      check (
        acces_motif is null
        or (acces_motif in ('illimite', 'abonnement') and acces_fin is null)
        or (acces_motif in ('essai', 'pilote') and acces_fin is not null)
      );
  end if;
end $$;

comment on column public.garages.acces_motif is
  'Pourquoi ce garage a accès : essai | pilote | abonnement | illimite. NULL = pas d''accès.';
comment on column public.garages.acces_fin is
  'Jusqu''à quand, pour essai et pilote. NULL pour abonnement et illimite.';
comment on column public.garages.essai_fin is
  'CONSERVÉE POUR COMPATIBILITÉ. Tenue à jour par garages_synchroniser_essai_fin ; l''autorité est acces_motif/acces_fin. À supprimer quand plus rien ne la lit.';
comment on column public.garages.pilote_debut is
  'Date d''octroi du mois offert. Écrite par accorder_acces_pilote().';

-- ── Reprise de l'existant ───────────────────────────────────────────────────

update public.garages
set acces_motif = case
      when abonnement_actif then 'abonnement'
      when essai_fin is null then 'illimite'
      else 'essai'
    end,
    acces_fin = case
      when abonnement_actif then null
      when essai_fin is null then null
      else essai_fin
    end
where acces_motif is null;

-- ── La compatibilité, le temps que l'interface se déploie ───────────────────

create or replace function public.garages_synchroniser_essai_fin()
returns trigger
language plpgsql
as $$
begin
  -- `essai_fin` reflète l'accès pour l'interface encore déployée :
  --   essai / pilote → la date de fin
  --   illimite       → NULL, que l'ancienne interface lit comme « sans limite »
  --   abonnement     → NULL également ; abonnement_actif suffit à ouvrir
  new.essai_fin := case
    when new.acces_motif in ('essai', 'pilote') then new.acces_fin
    else null
  end;
  return new;
end;
$$;

revoke all on function public.garages_synchroniser_essai_fin() from public, anon, authenticated, service_role;

drop trigger if exists garages_synchroniser_essai_fin on public.garages;
create trigger garages_synchroniser_essai_fin
  before insert or update of acces_motif, acces_fin on public.garages
  for each row execute function public.garages_synchroniser_essai_fin();

-- ── La règle d'accès, réécrite sur le motif ─────────────────────────────────

create or replace function public.acces_garage_ouvert(p_garage_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.garages g
    where g.id = p_garage_id
      and (
        g.abonnement_actif
        or g.acces_motif = 'illimite'
        or (g.acces_fin is not null and g.acces_fin > now())
      )
  );
$$;

revoke all on function public.acces_garage_ouvert(uuid) from public, anon, service_role;
grant execute on function public.acces_garage_ouvert(uuid) to authenticated;

-- ── Le mois offert ──────────────────────────────────────────────────────────
--
-- Accordé par l'éditeur, jamais par le garage. C'est exactement la leçon de
-- 20260909000600 : une faveur commerciale que le bénéficiaire peut s'accorder
-- lui-même n'est pas une faveur, c'est une porte ouverte. Cette fonction est
-- donc fermée à `authenticated` et à `anon`, et réservée à `service_role`.

create or replace function public.accorder_acces_pilote(p_garage_id uuid, p_mois integer default 1)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_fin timestamptz;
begin
  if p_mois is null or p_mois < 1 or p_mois > 12 then
    raise exception 'accorder_acces_pilote: duree invalide (%)', p_mois using errcode = '22023';
  end if;

  -- On part de la fin d'accès en cours quand elle est future : un garage à qui
  -- il reste huit jours d'essai ne doit pas les perdre en recevant son mois.
  select greatest(coalesce(g.acces_fin, now()), now()) into v_fin
  from public.garages g where g.id = p_garage_id;

  if v_fin is null then
    raise exception 'accorder_acces_pilote: garage introuvable (%)', p_garage_id using errcode = 'P0002';
  end if;

  v_fin := v_fin + make_interval(months => p_mois);

  update public.garages
  set acces_motif  = 'pilote',
      acces_fin    = v_fin,
      pilote_debut = coalesce(pilote_debut, now())
  where id = p_garage_id;

  return v_fin;
end;
$$;

revoke all on function public.accorder_acces_pilote(uuid, integer) from public, anon, authenticated;
grant execute on function public.accorder_acces_pilote(uuid, integer) to service_role;

-- ── La création d'un garage pose désormais le motif ─────────────────────────

create or replace function public.creer_mon_garage(
  p_nom_garage text, p_adresse text, p_telephone text, p_email text, p_profil_activite text[]
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_utilisateur uuid := auth.uid();
  v_garage_id uuid;
begin
  if v_utilisateur is null then
    raise exception 'creer_mon_garage: appel sans session authentifiee' using errcode = '28000';
  end if;

  if length(btrim(coalesce(p_nom_garage, ''))) = 0 then
    raise exception 'creer_mon_garage: le nom du garage est obligatoire' using errcode = '22023';
  end if;

  if not public.profil_activite_valide(p_profil_activite) then
    raise exception 'creer_mon_garage: profil d''activite invalide' using errcode = '22023';
  end if;

  if exists (select 1 from public.garages g where g.owner_user_id = v_utilisateur) then
    raise exception 'creer_mon_garage: ce compte possede deja un garage' using errcode = '23505';
  end if;

  insert into public.garages (
    owner_user_id, nom_garage, adresse, telephone, email, profil_activite,
    acces_motif, acces_fin
  )
  values (
    v_utilisateur,
    btrim(p_nom_garage),
    nullif(btrim(coalesce(p_adresse, '')), ''),
    nullif(btrim(coalesce(p_telephone, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    p_profil_activite,
    'essai',
    now() + interval '14 days'
  )
  returning id into v_garage_id;

  return v_garage_id;
end;
$$;

revoke all on function public.creer_mon_garage(text, text, text, text, text[]) from public, anon, service_role;
grant execute on function public.creer_mon_garage(text, text, text, text, text[]) to authenticated;

-- ── Le garage ne s'accorde pas son propre accès ─────────────────────────────
--
-- Même règle que 20260909000600 : les colonnes neuves n'entrent PAS dans la
-- liste blanche de `authenticated`. Elles ne sont donc écrivables que par les
-- fonctions ci-dessus et par la clé de service.

revoke update on public.garages from anon, authenticated;

grant update (
  nom_garage, email, telephone, adresse, modules_actifs, horaires,
  objectif_ca_mensuel, numero_whatsapp, lien_avis_google, canaux_notifications,
  theme, automatisation_active, gmail_connecte, gmail_adresse,
  rappel_confirmation_actif, delai_confirmation_rdv_h, profil_activite,
  siren, tva_sur_les_debits
) on public.garages to authenticated;

-- ── Vérification ────────────────────────────────────────────────────────────

do $$
declare
  sans_motif integer;
  fermes     integer;
  fuite      text;
begin
  select count(*) into sans_motif from public.garages where acces_motif is null;
  if sans_motif > 0 then
    raise exception '% garage(s) sans motif d''acces : la reprise est incomplete', sans_motif;
  end if;

  -- Le point qui compte : personne ne doit perdre l'accès à cause de cette
  -- migration. Un contrôle d'accès qui ferme trop est aussi grave qu'un
  -- contrôle qui ouvre trop.
  select count(*) into fermes
  from public.garages g
  where not public.acces_garage_ouvert(g.id);
  if fermes > 0 then
    raise exception '% garage(s) se retrouvent fermes apres migration', fermes;
  end if;

  select string_agg(c.nom, ', ' order by c.nom) into fuite
  from (values ('acces_motif'), ('acces_fin'), ('essai_fin'), ('abonnement_actif'),
               ('forfait'), ('pilote_debut'), ('owner_user_id')) as c(nom)
  where has_column_privilege('authenticated', 'public.garages', c.nom, 'UPDATE');
  if fuite is not null then
    raise exception 'authenticated peut ecrire son propre acces : %', fuite;
  end if;

  if has_function_privilege('authenticated', 'public.accorder_acces_pilote(uuid, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.accorder_acces_pilote(uuid, integer)', 'EXECUTE') then
    raise exception 'accorder_acces_pilote est accessible au garage : le mois offert se distribuerait tout seul';
  end if;

  if not has_function_privilege('service_role', 'public.accorder_acces_pilote(uuid, integer)', 'EXECUTE') then
    raise exception 'accorder_acces_pilote est fermee a service_role : l''editeur ne peut plus l''accorder';
  end if;

  if not has_column_privilege('authenticated', 'public.garages', 'nom_garage', 'UPDATE') then
    raise exception 'l''ecran Parametres ne peut plus enregistrer';
  end if;
end $$;

commit;

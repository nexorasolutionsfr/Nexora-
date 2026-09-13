-- Une plaque appartient à un garage, pas à Nexora.
--
-- CE QU'ON CORRIGE
--
-- `vehicules_immatriculation_unique` était `UNIQUE (immatriculation)` : une
-- contrainte GLOBALE, sans `garage_id`. Deux garages ne pouvaient donc pas
-- détenir la même plaque. Trois conséquences, toutes constatées :
--
--   1. un client qui change de garage ne peut pas être enregistré par le
--      second — la voiture existe déjà « quelque part » ;
--   2. l'erreur remontée révèle au second garage l'existence de la plaque
--      chez un autre : une fuite entre locataires, par un message d'erreur ;
--   3. `importer_clients_vehicules` a dû s'en défendre en refusant les lignes
--      concernées avec le motif « immatriculation non disponible » — un rejet
--      de données parfaitement valides.
--
-- Invisible tant que la Production n'a qu'un garage. Blocage au deuxième.
--
-- CE QU'ON MET À LA PLACE
--
-- L'unicité par garage, sur la plaque NORMALISÉE. « AB-123-CD », « ab123cd »
-- et « AB 123 CD » sont la même voiture : les laisser cohabiter dans le même
-- garage crée deux dossiers pour un seul véhicule, et c'est exactement ce que
-- l'ancienne contrainte permettait.
--
-- La normalisation n'est pas inventée ici : c'est mot pour mot celle que
-- `importer_clients_vehicules` applique déjà depuis sa création
-- (`upper(regexp_replace(…, '[^A-Za-z0-9]', '', 'g'))`), et celle que
-- `normaliserPlaque` applique côté écran.
--
-- LES VÉHICULES SANS PLAQUE RESTENT POSSIBLES
--
-- Véhicule neuf non immatriculé, fiche ouverte au téléphone : l'index est
-- partiel et les ignore, comme le faisait l'ancienne contrainte avec les NULL.
-- Une plaque qui se réduit à rien après normalisation (« --- ») est traitée
-- comme une absence de plaque, pas comme une plaque vide partagée.

begin;

-- 1. Vérification préalable : la normalisation est plus stricte que l'égalité
--    exacte, elle peut donc révéler des doublons jusqu'ici tolérés. On refuse
--    d'appliquer la migration plutôt que de la faire échouer à mi-chemin sur
--    la création de l'index.
do $$
declare v_collisions int;
begin
  select count(*) into v_collisions from (
    select garage_id,
           upper(regexp_replace(immatriculation, '[^A-Za-z0-9]', '', 'g')) as plaque
    from public.vehicules
    where immatriculation is not null
      and upper(regexp_replace(immatriculation, '[^A-Za-z0-9]', '', 'g')) <> ''
    group by 1, 2
    having count(*) > 1
  ) x;
  if v_collisions > 0 then
    raise exception
      'Migration refusée : % groupe(s) de véhicules du même garage portent la même plaque une fois normalisée. Fusionnez ces fiches avant d''appliquer.',
      v_collisions;
  end if;
end $$;

-- 2. L'ancienne contrainte globale. C'est bien une CONTRAINTE (UNIQUE
--    (immatriculation)), pas un simple index : `drop index` ne suffirait pas.
alter table public.vehicules
  drop constraint if exists vehicules_immatriculation_unique;

-- 3. L'unicité réelle : par garage, sur la plaque normalisée.
--    Index partiel plutôt que contrainte, parce qu'une contrainte de table ne
--    peut porter ni sur une expression ni sur un sous-ensemble de lignes.
create unique index if not exists vehicules_immatriculation_unique_par_garage
  on public.vehicules (
    garage_id,
    upper(regexp_replace(immatriculation, '[^A-Za-z0-9]', '', 'g'))
  )
  where immatriculation is not null
    and upper(regexp_replace(immatriculation, '[^A-Za-z0-9]', '', 'g')) <> '';

comment on index public.vehicules_immatriculation_unique_par_garage is
  'Une plaque ne peut apparaitre deux fois dans le meme garage, en comparant sur la forme normalisee (majuscules, sans separateurs). Deux garages differents peuvent detenir la meme plaque : une voiture change de garage. Les vehicules sans plaque sont hors index.';

-- 4. Le message.
--
--    Une violation d'index nue renvoie « duplicate key value violates unique
--    constraint "vehicules_immatriculation_unique_par_garage" ». Personne au
--    comptoir ne sait quoi en faire. Ce trigger dit ce qui s'est passé et ce
--    qu'il faut faire à la place.
--
--    Il n'est PAS `security definer` : on veut que la recherche du doublon
--    soit filtrée par RLS comme le reste, et le garde-fou réel reste l'index
--    ci-dessus — qui, lui, ne dépend d'aucune visibilité. Le trigger apporte
--    le message ; l'index apporte la garantie, y compris en concurrence.
create or replace function public.vehicules_check_immatriculation()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_norm text;
  v_existante text;
begin
  v_norm := nullif(upper(regexp_replace(coalesce(new.immatriculation, ''), '[^A-Za-z0-9]', '', 'g')), '');
  if v_norm is null then
    return new; -- vehicule sans plaque : rien a verifier
  end if;

  -- On renvoie la plaque TELLE QU'ELLE EST DEJA ENREGISTREE, pas celle qui
  -- vient d'etre tapee : « ba 101 aa » et « BA-101-AA » sont le meme vehicule,
  -- et c'est la fiche existante que le garagiste doit pouvoir retrouver.
  select v.immatriculation into v_existante
  from public.vehicules v
  where v.garage_id = new.garage_id
    and v.id is distinct from new.id
    and nullif(upper(regexp_replace(coalesce(v.immatriculation, ''), '[^A-Za-z0-9]', '', 'g')), '') = v_norm
  limit 1;

  if v_existante is not null then
    raise exception
      'Ce garage a deja un vehicule immatricule %. Ouvrez sa fiche au lieu d''en creer une seconde.',
      v_existante
      using errcode = '23505';
  end if;

  return new;
end;
$function$;

comment on function public.vehicules_check_immatriculation() is
  'Message lisible sur doublon de plaque DANS un garage. La garantie reelle est l''index vehicules_immatriculation_unique_par_garage ; ce trigger ne fait que rendre l''echec comprehensible. Ne verifie rien hors du garage de la ligne : une plaque detenue ailleurs ne regarde pas ce garage.';

drop trigger if exists vehicules_check_immatriculation_trigger on public.vehicules;
create trigger vehicules_check_immatriculation_trigger
  before insert or update of immatriculation, garage_id on public.vehicules
  for each row execute function public.vehicules_check_immatriculation();

commit;

-- Le client et le véhicule d'un contrôle se correspondent — garanti en base,
-- y compris hors interface.
--
-- POURQUOI
-- Relevé sur Test le 15 septembre 2026 : sous la session du dirigeant, le
-- véhicule d'un contrôle non verrouillé a pu être remplacé par celui d'un
-- AUTRE client ; l'enregistrement a réussi et le contrôle a gardé le client
-- d'origine. Aucun écran ne propose ce geste (le véhicule se choisit à la
-- création, parmi ceux du client), mais la table l'acceptait. Distinct du
-- défaut « modification sans effet », non reproduit.
--
-- LA RÈGLE
-- À l'insertion, et à toute modification du client, du véhicule ou du garage
-- d'un contrôle :
-- - le véhicule doit appartenir au garage du contrôle ;
-- - si le contrôle a un client ET que le véhicule en a un, ce doit être le
--   même.
-- Un contrôle sans client enregistré (saisie libre) ou un véhicule sans client
-- restent possibles.
--
-- CE QUE LA MIGRATION NE FAIT PAS
-- - Elle ne corrige, ne réaffecte ni ne valide aucune ligne existante
--   (relevé du 15 sept. : 0 contrôle incohérent sur Test comme en Production).
-- - Elle ne touche pas les contrôles verrouillés : le trigger existant
--   `inspections_verrou_contenu` s'exécute AVANT celui-ci (ordre alphabétique)
--   et garde son message ; celui-ci ne fait que refuser.
-- - Changer le propriétaire d'un véhicule (`vehicules.client_id`) n'est pas
--   concerné : l'historique des contrôles garde le client de l'époque.

create or replace function public.inspections_client_vehicule_coherents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_garage uuid;
begin
  if new.vehicule_id is null then
    return new;
  end if;

  select client_id, garage_id into v_client, v_garage
    from public.vehicules
   where id = new.vehicule_id;

  if not found then
    raise exception 'inspections: vehicule introuvable';
  end if;

  if v_garage is distinct from new.garage_id then
    raise exception using
      message = 'inspections: le vehicule appartient a un autre garage',
      hint = 'vehicule_autre_garage';
  end if;

  if new.client_id is not null and v_client is not null and v_client <> new.client_id then
    raise exception using
      message = 'inspections: ce vehicule appartient a un autre client que celui du controle',
      hint = 'vehicule_autre_client';
  end if;

  return new;
end;
$$;

revoke execute on function public.inspections_client_vehicule_coherents() from public;
revoke execute on function public.inspections_client_vehicule_coherents() from anon;
revoke execute on function public.inspections_client_vehicule_coherents() from authenticated;

drop trigger if exists inspections_vz_client_vehicule_coherents on public.inspections;
create trigger inspections_vz_client_vehicule_coherents
  before insert or update of client_id, vehicule_id, garage_id on public.inspections
  for each row
  execute function public.inspections_client_vehicule_coherents();

comment on function public.inspections_client_vehicule_coherents() is
  'Refuse un contrôle dont le véhicule appartient à un autre garage ou à un autre client que le sien (insertion et changement de client, véhicule ou garage). Ne modifie ni ne valide aucune ligne existante ; les contrôles verrouillés gardent leur propre refus.';

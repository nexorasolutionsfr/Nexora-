-- Réserve levée : factures.ordre_reparation_id (ajoutée en 20260904000600)
-- n'avait aucune garantie d'appartenance au même garage, alors que ses deux
-- tables sœurs en ont une (ordres_reparation_check_integrite,
-- devis_lignes_check_integrite). Une facture pouvait donc référencer l'OR
-- d'un autre garage — la RLS filtre les lectures, mais la référence
-- elle-même n'était pas contrainte.
--
-- Même convention que les triggers d'intégrité existants : plpgsql,
-- search_path figé, messages sans accent, validation à l'INSERT et à
-- l'UPDATE de la référence. Ne valide que ce qui est réellement vérifiable
-- ici : le garage de l'OR référencé, et la cohérence du rendez-vous quand
-- les deux sont renseignés.
create function public.factures_check_integrite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_or_garage uuid;
  v_or_rdv uuid;
begin
  if new.ordre_reparation_id is not null then
    select garage_id, rendez_vous_id
      into v_or_garage, v_or_rdv
      from public.ordres_reparation
      where id = new.ordre_reparation_id;

    if not found then
      raise exception 'factures: ordre de reparation introuvable';
    end if;

    if v_or_garage is distinct from new.garage_id then
      raise exception 'factures: l''ordre de reparation appartient a un autre garage';
    end if;

    -- Une facture et son OR décrivent la même intervention : si la facture
    -- porte un rendez-vous, ce doit être celui de l'OR.
    if new.rendez_vous_id is not null and v_or_rdv is distinct from new.rendez_vous_id then
      raise exception 'factures: l''ordre de reparation ne correspond pas au rendez_vous de cette facture';
    end if;
  end if;

  return new;
end;
$$;

create trigger factures_check_integrite_trigger
  before insert or update of ordre_reparation_id, garage_id, rendez_vous_id on public.factures
  for each row
  execute function public.factures_check_integrite();

comment on function public.factures_check_integrite() is
  'Garantit qu''une facture ne reference jamais un ordre de reparation d''un autre garage, ni un OR rattache a un autre rendez-vous que le sien. Meme convention que ordres_reparation_check_integrite.';

-- Défense en profondeur, jamais la seule RLS : même arithmétique que
-- 20260904000200 (4 beneficiaires x 1 fonction de declencheur = 4 REVOKE).
-- Une fonction de declencheur n'a pas besoin d'EXECUTE pour etre appelee par
-- le declencheur lui-meme.
revoke execute on function public.factures_check_integrite() from public;
revoke execute on function public.factures_check_integrite() from anon;
revoke execute on function public.factures_check_integrite() from authenticated;
revoke execute on function public.factures_check_integrite() from service_role;

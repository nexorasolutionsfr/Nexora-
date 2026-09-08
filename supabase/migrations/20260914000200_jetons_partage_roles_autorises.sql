-- Les jetons de lien public ne sont plus réservés au propriétaire du garage.
--
-- POURQUOI
--
-- `creer_jeton_devis` et `creer_jeton_facture` exigeaient
-- `garages.owner_user_id = auth.uid()`. Un salarié à l'accueil, qui a le droit
-- d'établir un devis et de l'envoyer, ne pouvait pas produire le lien : la
-- fonction levait « accès refusé ». Le parcours salarié était donc cassé dès
-- que le lien devenait obligatoire.
--
-- On remplace le test de propriété par `a_acces_garage`, la même règle que le
-- reste de l'application — propriétaire ou membre au rôle voulu. Les droits
-- ne sont PAS élargis au rôle de service : ces fonctions restent réservées à
-- `authenticated`, et le contrôle reste explicite (jamais une délégation à
-- RLS, qui ne s'applique pas à une fonction SECURITY DEFINER).
--
-- Rôles retenus :
--   devis   : dirigeant, accueil          (établir et envoyer un devis)
--   facture : dirigeant                   (peutFacturer() côté application)

create or replace function public.creer_jeton_devis(p_devis_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_token text;
begin
  select d.garage_id into v_garage_id
  from public.devis d
  where d.id = p_devis_id
  for update of d;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  update public.devis_jetons
    set revoked_at = now()
    where devis_id = p_devis_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
  values (p_devis_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');

  return v_token;
end;
$function$;

revoke execute on function public.creer_jeton_devis(uuid) from public, anon;
grant execute on function public.creer_jeton_devis(uuid) to authenticated;

create or replace function public.creer_jeton_facture(p_facture_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_token text;
begin
  select f.garage_id into v_garage_id
  from public.factures f
  where f.id = p_facture_id
  for update of f;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  update public.factures_jetons
    set revoked_at = now()
    where facture_id = p_facture_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.factures_jetons (facture_id, garage_id, jeton_hash, expires_at)
  values (p_facture_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');

  return v_token;
end;
$function$;

revoke execute on function public.creer_jeton_facture(uuid) from public, anon;
grant execute on function public.creer_jeton_facture(uuid) to authenticated;

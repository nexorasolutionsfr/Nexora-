-- Plusieurs liens valides par document.
--
-- LA DÉCISION
--
-- Un index unique partiel n'autorisait qu'un jeton actif par document, ce qui
-- obligeait `creer_jeton_*` à révoquer l'ancien avant d'émettre. Conséquence :
-- regénérer ou simplement copier un lien tuait celui que le client avait déjà
-- reçu. La migration 20260914001000 a supprimé le cas le plus visible (un
-- envoi encore en file). Elle ne pouvait pas couvrir le lien déjà parti, dont
-- le secret est effacé après usage.
--
-- On lève donc la contrainte : plusieurs jetons peuvent coexister. Chacun fait
-- 256 bits, n'ouvre que son document, et garde sa propre échéance.
--
-- CE QUI NE CHANGE PAS
--
--  - Les empreintes seules sont stockées ; le secret ne vit en clair que dans
--    la file, le temps de l'envoi, et y est effacé ensuite.
--  - L'échéance de 90 jours est propre à chaque jeton : émettre un lien neuf
--    ne prolonge aucun ancien.
--  - `revoquer_jeton_devis` / `revoquer_jeton_facture` révoquent **tous** les
--    jetons du document : c'est le geste par lequel le garage coupe l'accès,
--    et il reste entier.
--  - Les droits par rôle et l'isolation par garage sont inchangés.
--
-- SUR LE REJEU D'UNE DÉCISION
--
-- Rien à ajouter : `repondre_devis_par_jeton` verrouille le devis et refuse
-- (`deja_repondu`) si son statut n'est plus `en_attente`. La règle porte donc
-- déjà sur le document, pas sur le jeton — deux liens valides ne permettent
-- pas deux réponses. Un test le vérifie plutôt qu'un commentaire l'affirme.

drop index if exists public.devis_jetons_actif_unique;
drop index if exists public.factures_jetons_actif_unique;

-- Un index simple reste utile pour retrouver les jetons vivants d'un document.
create index if not exists devis_jetons_actifs_idx
  on public.devis_jetons (devis_id) where revoked_at is null;
create index if not exists factures_jetons_actifs_idx
  on public.factures_jetons (facture_id) where revoked_at is null;

create or replace function public.creer_jeton_devis(p_devis_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_token text;
  v_en_file text;
begin
  select d.garage_id into v_garage_id
  from public.devis d where d.id = p_devis_id for update of d;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  -- Un envoi en partance porte déjà un jeton : autant rendre le même, pour que
  -- le lien copié dans l'interface et celui reçu par e-mail soient un seul.
  select n.jeton into v_en_file
  from public.notifications_devis n
  where n.devis_id = p_devis_id and n.jeton is not null
    and n.statut in ('en_attente', 'envoi_en_cours')
  order by n.created_at desc limit 1;
  if v_en_file is not null then
    return v_en_file;
  end if;

  -- Aucune révocation : les liens déjà remis au client continuent de vivre.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
  values (p_devis_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');
  return v_token;
end;
$function$;

create or replace function public.creer_jeton_facture(p_facture_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_token text;
  v_en_file text;
begin
  select f.garage_id into v_garage_id
  from public.factures f where f.id = p_facture_id for update of f;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  select n.jeton into v_en_file
  from public.notifications_factures n
  where n.facture_id = p_facture_id and n.jeton is not null
    and n.statut in ('en_attente', 'envoi_en_cours')
  order by n.created_at desc limit 1;
  if v_en_file is not null then
    return v_en_file;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.factures_jetons (facture_id, garage_id, jeton_hash, expires_at)
  values (p_facture_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');
  return v_token;
end;
$function$;

revoke execute on function public.creer_jeton_devis(uuid) from public, anon;
grant execute on function public.creer_jeton_devis(uuid) to authenticated;
revoke execute on function public.creer_jeton_facture(uuid) from public, anon;
grant execute on function public.creer_jeton_facture(uuid) to authenticated;

-- Ouvrir « Envoyer au client » ne doit pas tuer le lien déjà en partance.
--
-- LE DÉFAUT
--
-- L'interface appelle `creer_jeton_devis` dès que le panneau de partage
-- s'ouvre, et cette fonction révoquait le jeton précédent avant d'en émettre
-- un neuf (un index unique partiel n'autorise qu'un jeton actif par
-- document). Conséquence observée : une notification déjà en file, portant
-- son jeton, partait **morte** si le garagiste avait entre-temps cliqué sur
-- « Copier le lien ». Personne n'avait rien révoqué volontairement.
--
-- LA CORRECTION
--
-- Avant d'émettre, on regarde si une notification de ce document attend
-- encore son envoi (`en_attente` ou `envoi_en_cours`) et porte un jeton. Si
-- oui, c'est celui-là qu'on rend : le lien copié dans l'interface et le lien
-- qui partira par e-mail sont alors le même. Aucun jeton nouveau, aucune
-- révocation.
--
-- Sinon — pas de notification en attente — on émet, et l'index unique révoque
-- l'ancien. C'est la sémantique « regénérer un lien », assumée.
--
-- CE QUI RESTE OUVERT, ET QUI EST UNE DÉCISION, PAS UN OUBLI
--
-- Une fois le message parti, le jeton est effacé de la file (c'est la règle
-- retenue pour ce secret). L'interface ne peut donc plus le rendre : générer
-- un lien après l'envoi en produit un nouveau et invalide celui que le client
-- a reçu. Pour couvrir aussi ce cas, il faudrait soit conserver le secret
-- dans la file (table verrouillée, mais conservation prolongée), soit
-- autoriser plusieurs jetons actifs par document. Les deux se défendent ;
-- c'est un arbitrage à trancher, pas quelque chose à décider en passant.
--
-- La révocation explicite (`revoquer_jeton_devis`, `revoquer_jeton_facture`)
-- n'est pas touchée : elle révoque toujours tous les jetons du document.

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
  from public.devis d
  where d.id = p_devis_id
  for update of d;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  -- Un envoi est-il en partance avec son jeton ? Alors c'est celui-là.
  select n.jeton into v_en_file
  from public.notifications_devis n
  where n.devis_id = p_devis_id
    and n.jeton is not null
    and n.statut in ('en_attente', 'envoi_en_cours')
  order by n.created_at desc
  limit 1;

  if v_en_file is not null then
    return v_en_file;
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
  from public.factures f
  where f.id = p_facture_id
  for update of f;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  select n.jeton into v_en_file
  from public.notifications_factures n
  where n.facture_id = p_facture_id
    and n.jeton is not null
    and n.statut in ('en_attente', 'envoi_en_cours')
  order by n.created_at desc
  limit 1;

  if v_en_file is not null then
    return v_en_file;
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

revoke execute on function public.creer_jeton_devis(uuid) from public, anon;
grant execute on function public.creer_jeton_devis(uuid) to authenticated;
revoke execute on function public.creer_jeton_facture(uuid) from public, anon;
grant execute on function public.creer_jeton_facture(uuid) to authenticated;

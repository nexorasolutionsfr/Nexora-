-- Une notification bloquée dit depuis quand, et pourquoi.
--
-- POURQUOI
--
-- Trois véhicules de la Production sont notés prêts depuis fin août, avec une
-- notification `bloque` datant du 23 août, du 24 août et du 5 septembre. Après
-- publication, l'écran proposera de les revalider. Revalider à l'aveugle
-- enverrait « venez chercher votre voiture » pour un rendez-vous vieux de
-- trois semaines.
--
-- `etat_envoi_atelier` rendait le motif mais pas la date : l'écran ne pouvait
-- donc pas dire « bloquée depuis le 23 août ». Il le peut maintenant.
--
-- Ces trois lignes ne sont NI modifiées NI supprimées : on les montre, on ne
-- les nettoie pas. Nettoyer un écran en effaçant ce qui gêne, c'est perdre
-- l'information qui justifiait de s'y arrêter.

create or replace function public.etat_envoi_atelier(p_rendez_vous_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_n record;
begin
  select r.garage_id into v_garage_id from public.rendez_vous r where r.id = p_rendez_vous_id;
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    return jsonb_build_object('ok', false, 'raison', 'acces_refuse');
  end if;

  select n.statut, n.envoye, n.tentatives, n.derniere_erreur, n.destinataire_valide, n.created_at
    into v_n
  from public.notifications_atelier n
  where n.rendez_vous_id = p_rendez_vous_id and n.type = 'vehicule_pret'
  order by n.created_at desc limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'etat', 'aucune');
  end if;

  return jsonb_build_object(
    'ok', true,
    'etat', case v_n.statut
              when 'sans_lien'      then 'a_valider'
              when 'en_attente'     then 'en_attente_envoi'
              when 'envoi_en_cours' then 'envoi_en_cours'
              when 'envoye'         then 'envoye'
              when 'bloque'         then 'bloque'
              else v_n.statut end,
    'destinataire', v_n.destinataire_valide,
    'tentatives', v_n.tentatives,
    -- Depuis quand cette ligne existe. Sur une ligne bloquee, c'est l'age du
    -- blocage : l'ecran le montre avant de proposer une revalidation.
    'depuis', v_n.created_at,
    'motif', v_n.derniere_erreur);
end;
$function$;

comment on function public.etat_envoi_atelier(uuid) is
  'Etat de la notification "vehicule pret" d''un rendez-vous, avec son motif et sa date. Lecture seule, reservee au dirigeant et a l''accueil.';

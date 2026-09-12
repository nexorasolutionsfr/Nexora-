-- Un devis créé n'est pas un devis envoyé.
--
-- CE QUI ÉTAIT FAUX (recette « dix premières minutes », 11 septembre 2026)
--
-- `notifier_nouveau_devis` produisait un jeton et mettait la notification en
-- `en_attente` dès qu'un garagiste créait un devis depuis l'application. Le
-- traitement réserve toute ligne `en_attente` dont l'empreinte est nulle : le
-- message partait donc au client dans les deux minutes, au montant du moment
-- — 0 € dans la recette, puisque les lignes se saisissent après la création —
-- sans que le garage ait vu le message ni cliqué sur quoi que ce soit.
-- L'écran annonçait « En attente d'envoi » et ne proposait plus d'envoyer.
--
-- CE QUE FAIT CETTE MIGRATION
--
-- La notification naît toujours `sans_lien`, sans jeton, que le devis vienne
-- de l'application ou de l'Assistant. `autoriser_envoi_devis`
-- (20260914001300) reste le seul chemin vers un envoi : il enregistre le
-- destinataire montré et l'empreinte du devis, et la réservation refuse
-- d'envoyer si l'un des deux a changé depuis.
--
-- CE QU'ELLE NE FAIT PAS
--
-- Les notifications déjà en file ne sont pas touchées : les retirer ici
-- reviendrait à décider à la place des garages concernés. La facture a le
-- même défaut (`notifier_nouvelle_facture`) ; elle sort du parcours recetté
-- et relève d'un lot séparé.

create or replace function public.notifier_nouveau_devis()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.statut <> 'en_attente' then
    return new;
  end if;

  insert into notifications_devis (devis_id, type, statut)
  values (new.id, 'nouveau', 'sans_lien');
  return new;
end;
$function$;

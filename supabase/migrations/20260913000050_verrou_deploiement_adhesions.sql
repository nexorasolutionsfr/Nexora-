-- Verrou de déploiement : aucune adhésion active ne peut naître pendant le lot.
--
-- POURQUOI
--
-- `20260913000100` crée la policy `garages_membre_select`, qui rend au salarié
-- sa ligne `garages` **entière** — `stripe_customer_id`, `siren`,
-- `objectif_ca_mensuel` compris. `20260913000300` la retire. Entre les deux,
-- `supabase db push` applique fichier par fichier, chacun dans sa transaction :
-- il n'existe aucun moyen officiel de rendre les cinq atomiques. La policy
-- existe donc réellement, quelques secondes — et indéfiniment si le push
-- s'interrompt là.
--
-- On a d'abord cru la fenêtre inoffensive parce que `garage_membres` est vide
-- en Production et que l'écran de rattachement n'y est pas déployé. C'est
-- faux : `inviter_membre_garage` est `grant execute ... to authenticated`
-- depuis le 5 septembre. N'importe quel dirigeant peut l'appeler directement
-- par PostgREST, sans écran, et son `on conflict do update set actif = true,
-- revoked_at = null` réactive même une adhésion révoquée. Une précondition
-- constatée avant le push ne protège rien pendant le push.
--
-- POURQUOI UN TRIGGER, ET PAS UN REVOKE
--
-- Révoquer l'EXECUTE des RPC ne suffirait pas : elles sont toutes
-- `security definer`, donc `inviter_membre_par_email` — créée par 000100,
-- après ce fichier — appellerait `inviter_membre_garage` avec les droits du
-- propriétaire, quel que soit l'état des GRANT. Il faudrait énumérer chaque
-- porte, y compris celles que le lot ajoute, et n'en oublier aucune.
--
-- Un trigger sur la table ferme **toutes** les portes d'un coup, existantes et
-- à venir : aucune fonction, si privilégiée soit-elle, n'écrit dans une table
-- sans passer par ses triggers.
--
-- CE QUI RESTE POSSIBLE
--
-- La révocation d'une adhésion. Bloquer aussi les retraits serait un verrou
-- qui protège dans le mauvais sens : si le déploiement s'éternise, on doit
-- pouvoir couper un accès. Seule la création — et la réactivation, qui en est
-- une — est refusée.
--
-- CE FICHIER EST TEMPORAIRE. `20260913000600` le retire, en dernier. Si le
-- push s'arrête n'importe où entre les deux, on reste du bon côté : la
-- fonctionnalité est indisponible, et rien n'est exposé.

create or replace function public.garage_membres_verrou_deploiement()
returns trigger
language plpgsql
as $$
begin
  -- Une adhésion active est exactement ce que la policy de 000100 exige pour
  -- rendre la ligne `garages`. Tant que le lot n'est pas complet, on n'en
  -- laisse pas apparaître une seule.
  if new.actif = true and new.revoked_at is null then
    raise exception
      'Rattachement d''un salarié momentanément indisponible : déploiement en cours. Réessayez dans quelques minutes.'
      using errcode = '55006';
  end if;
  return new;
end;
$$;

comment on function public.garage_membres_verrou_deploiement() is
  'Verrou temporaire du lot accès salariés du 2026-09-13 : refuse toute adhésion active nouvelle ou réactivée pendant le déploiement. Retiré par 20260913000600.';

revoke all on function public.garage_membres_verrou_deploiement() from public, anon, authenticated, service_role;

drop trigger if exists garage_membres_verrou_deploiement on public.garage_membres;
create trigger garage_membres_verrou_deploiement
  before insert or update on public.garage_membres
  for each row execute function public.garage_membres_verrou_deploiement();

do $$
declare
  v_actifs integer;
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'garage_membres'
      and t.tgname = 'garage_membres_verrou_deploiement' and not t.tgisinternal
  ) then
    raise exception 'Migration 20260913000050 incomplete : le verrou n''est pas pose';
  end if;

  -- Trace de ce qui existait au moment de la pose : le verrou empêche les
  -- nouvelles adhésions, il ne retire pas celles déjà là. La policy de 000100
  -- rendra la ligne garages à celles-ci, et à elles seules.
  select count(*) into v_actifs
  from public.garage_membres where actif = true and revoked_at is null;
  raise notice 'Verrou de deploiement pose. Adhesions actives preexistantes : %', v_actifs;
end;
$$;

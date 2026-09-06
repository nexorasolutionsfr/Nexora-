-- Lot sécurité anon — 3/3 : retirer TRUNCATE sur la table des secrets.
--
-- Constat, relevé le 2026-09-05 sur Test et sur Production : `public.garages_secrets`
-- a RLS active et **aucune policy**, donc aucune lecture ni écriture par
-- ligne n'est possible depuis le client. Mais `TRUNCATE` n'est jamais filtré
-- par RLS, et ce privilège reste accordé à `anon` et à `authenticated` sur
-- les deux projets.
--
-- Audit d'impact avant fermeture, conclusion : aucun.
--   - PostgREST n'expose pas TRUNCATE ; aucun chemin d'API ne peut l'émettre.
--   - Aucune migration, aucun composant, aucune route du dépôt n'émet de
--     TRUNCATE : la recherche ne ramène que des commentaires de migrations
--     antérieures, qui signalaient déjà ce privilège comme indésirable
--     (20260902000100 et 20260904000100, « TRUNCATE, que la RLS ne filtre
--     jamais »).
--   - Aucune fonction `security definer` du schéma `public` ne contient
--     TRUNCATE dans son corps, sur aucun des deux projets.
-- Ce lot ne fait donc que refermer un privilège que rien n'utilise.
--
-- Volontairement HORS de cette migration : sur Test, `anon` et
-- `authenticated` conservent en plus SELECT, INSERT, UPDATE et DELETE sur
-- cette table, là où la Production les a déjà retirés. RLS les neutralise
-- aujourd'hui, mais l'écart mérite un lot de convergence à part, avec sa
-- propre recette — le fermer ici mélangerait deux intentions.

revoke truncate on table public.garages_secrets from anon;
revoke truncate on table public.garages_secrets from authenticated;
revoke truncate on table public.garages_secrets from public;

do $$
declare
  v_restants text := '';
begin
  if has_table_privilege('anon', 'public.garages_secrets', 'TRUNCATE') then
    v_restants := v_restants || 'anon ';
  end if;
  if has_table_privilege('authenticated', 'public.garages_secrets', 'TRUNCATE') then
    v_restants := v_restants || 'authenticated ';
  end if;

  if v_restants <> '' then
    raise exception 'lot securite: TRUNCATE encore accorde sur garages_secrets a : %', v_restants;
  end if;
end;
$$;

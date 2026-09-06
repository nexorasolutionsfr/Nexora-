-- Accès salariés V1 — durcissement : refermer les EXECUTE ouverts par défaut.
--
-- Constat fait sur Test après application des migrations 1 à 7 : les
-- privilèges par défaut de Supabase accordent EXECUTE sur toute nouvelle
-- fonction de `public` à `anon`, `authenticated` et `service_role`. Un
-- `revoke ... from public` ne retire pas ces trois grants nominatifs : les
-- treize fonctions du chantier étaient donc appelables par un visiteur non
-- authentifié.
--
-- Aucune de ces fonctions n'était exploitable ainsi — sans session,
-- `auth.uid()` est nul, `a_acces_garage` renvoie faux et chaque appel se
-- solde par « Accès refusé » ou par un ensemble vide. Le risque était nul,
-- mais l'écart au refus par défaut était réel : une modification future de
-- l'une de ces fonctions aurait hérité d'une surface d'appel bien plus large
-- que prévu. On la referme maintenant, avant tout usage.
--
-- Même intention que 20260831001100_revenue_recovery_fermer_privileges_defaut.sql
-- et 20260902000200_fermer_execute_fonctions_ordre_reparation.sql.
--
-- `authenticated` est conservé : c'est le seul rôle qui appelle réellement
-- ces fonctions. `service_role` est retiré parce qu'aucun automate n'en a
-- l'usage — n8n ne touche ni aux rôles, ni aux membres, ni à l'atelier du
-- mécanicien. `public.current_garage_id()` n'est volontairement pas touchée :
-- ses grants sont antérieurs à ce chantier et d'autres appelants en
-- dépendent.

do $$
declare
  v_fn text;
  v_fns text[] := array[
    'public.mon_role_garage(uuid)',
    'public.a_acces_garage(uuid, text[])',
    'public.mon_mecanicien_id(uuid)',
    'public.atelier_mes_ordres()',
    'public.atelier_mon_ordre(uuid)',
    'public.atelier_marquer_ligne(uuid, text)',
    'public.atelier_avancer_etape(uuid, text)',
    'public.atelier_ajouter_note(uuid, text)',
    'public.atelier_mes_notes(uuid)',
    'public.lister_membres_garage(uuid)',
    'public.inviter_membre_garage(uuid, uuid, text, uuid)',
    'public.changer_role_membre(uuid, text, uuid)',
    'public.revoquer_membre_garage(uuid)'
  ];
begin
  foreach v_fn in array v_fns loop
    execute format('revoke execute on function %s from anon', v_fn);
    execute format('revoke execute on function %s from service_role', v_fn);
    execute format('revoke execute on function %s from public', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

-- Vérification immédiate, dans la même transaction que la migration : si
-- l'un des treize privilèges subsistait pour anon, la migration échoue au
-- lieu de laisser croire qu'elle a durci quelque chose.
do $$
declare
  v_restants text;
begin
  select string_agg(p.proname, ', ')
    into v_restants
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname in (
      'mon_role_garage', 'a_acces_garage', 'mon_mecanicien_id',
      'atelier_mes_ordres', 'atelier_mon_ordre', 'atelier_marquer_ligne',
      'atelier_avancer_etape', 'atelier_ajouter_note', 'atelier_mes_notes',
      'lister_membres_garage', 'inviter_membre_garage',
      'changer_role_membre', 'revoquer_membre_garage')
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_restants is not null then
    raise exception 'acces salaries: EXECUTE encore ouvert a anon sur %', v_restants;
  end if;
end;
$$;

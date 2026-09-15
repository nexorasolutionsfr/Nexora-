-- Base jetable, APRÈS les migrations 20260920* : contrôles. Chaque ligne
-- « OK … » ou « KO … » est comptée par le script. :compteur_avant = compteur
-- de numérotation du garage relevé juste avant la concurrence « après ».

-- Défaut 1 : concurrence (jouée par le script sur la fiche 2).
select case when count(*) = 1 then 'OK ' else 'KO ' end || 'concurrence après : une seule facture pour la fiche 2 (' || count(*) || ')'
  from public.factures where ordre_reparation_id = '00000000-0000-4000-8000-00000000b002';
select case when dernier_numero_facture = :compteur_avant + 1 then 'OK ' else 'KO ' end
       || 'aucun numéro consommé par le refus (compteur ' || :compteur_avant || ' → ' || dernier_numero_facture || ')'
  from public.garages where id = '00000000-0000-4000-8000-0000000000a1';
select case when count(*) = 2 then 'OK ' else 'KO ' end || 'doublon antérieur préservé (fiche 1 : ' || count(*) || ' factures, numéros ' || string_agg(numero, ', ' order by numero) || ')'
  from public.factures where ordre_reparation_id = '00000000-0000-4000-8000-00000000b001';

do $$ begin
  begin
    insert into public.factures (garage_id, client_id, vehicule_id, rendez_vous_id, ordre_reparation_id, motif, lignes, montant_ht, montant_ttc, statut)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001', 'troisième', '[]'::jsonb, 1, 1, 'en_attente');
    raise notice 'KO une fiche déjà facturée accepte encore une facture';
  exception when others then
    if sqlerrm like '%a deja sa facture%' then raise notice 'OK une fiche déjà facturée (même avec doublon ancien) refuse une nouvelle facture';
    else raise notice 'KO refus inattendu : %', sqlerrm; end if;
  end;
end $$;

insert into public.factures (garage_id, client_id, vehicule_id, motif, lignes, montant_ht, montant_ttc, statut)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'sans fiche 1', '[]'::jsonb, 1, 1, 'en_attente'),
       ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1', 'sans fiche 2', '[]'::jsonb, 1, 1, 'en_attente');
select case when count(*) = 2 then 'OK ' else 'KO ' end || 'factures sans fiche atelier toujours libres'
  from public.factures where motif like 'sans fiche %';

update public.factures set statut = 'payee', date_paiement = now()
 where ordre_reparation_id = '00000000-0000-4000-8000-00000000b002';
select case when count(*) = 1 then 'OK ' else 'KO ' end || 'la facture existante reste modifiable normalement (marquée payée)'
  from public.factures where ordre_reparation_id = '00000000-0000-4000-8000-00000000b002' and statut = 'payee';

-- Défaut 2 : cohérence client / véhicule.
do $$ begin
  begin
    update public.inspections set vehicule_id = '00000000-0000-4000-8000-0000000000e2' where id = '00000000-0000-4000-8000-00000000d001';
    raise notice 'KO véhicule d''un autre client encore accepté';
  exception when others then
    if sqlerrm like '%autre client%' then raise notice 'OK changement vers le véhicule d''un autre client refusé, rien modifié';
    else raise notice 'KO refus inattendu : %', sqlerrm; end if;
  end;
end $$;
select case when vehicule_id = '00000000-0000-4000-8000-0000000000e1' and client_id = '00000000-0000-4000-8000-0000000000c1' then 'OK ' else 'KO ' end
       || 'le contrôle garde son client et son véhicule'
  from public.inspections where id = '00000000-0000-4000-8000-00000000d001';

update public.inspections set vehicule_id = '00000000-0000-4000-8000-0000000000e3' where id = '00000000-0000-4000-8000-00000000d001';
select case when vehicule_id = '00000000-0000-4000-8000-0000000000e3' then 'OK ' else 'KO ' end || 'changement vers un autre véhicule du même client accepté'
  from public.inspections where id = '00000000-0000-4000-8000-00000000d001';

do $$ begin
  begin
    insert into public.inspections (garage_id, client_id, vehicule_id, statut)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e2', 'brouillon');
    raise notice 'KO création d''un contrôle incohérent acceptée';
  exception when others then
    if sqlerrm like '%autre client%' then raise notice 'OK création d''un contrôle avec le véhicule d''un autre client refusée';
    else raise notice 'KO refus inattendu : %', sqlerrm; end if;
  end;
end $$;

do $$ begin
  begin
    insert into public.inspections (garage_id, client_id, vehicule_id, statut)
    values ('00000000-0000-4000-8000-0000000000a1', null, '00000000-0000-4000-8000-0000000000e9', 'brouillon');
    raise notice 'KO véhicule d''un autre garage accepté';
  exception when others then
    if sqlerrm like '%autre garage%' then raise notice 'OK véhicule d''un autre garage refusé';
    else raise notice 'KO refus inattendu : %', sqlerrm; end if;
  end;
end $$;

insert into public.inspections (garage_id, client_id, vehicule_id, statut, client_nom_libre)
values ('00000000-0000-4000-8000-0000000000a1', null, '00000000-0000-4000-8000-0000000000e2', 'brouillon', 'Saisie libre');
select 'OK contrôle sans client enregistré (saisie libre) toujours possible';

do $$ begin
  begin
    update public.inspections set vehicule_id = '00000000-0000-4000-8000-0000000000e3' where id = '00000000-0000-4000-8000-00000000d002';
    raise notice 'KO contrôle verrouillé modifié';
  exception when others then
    if sqlerrm like '%verrouill%' then raise notice 'OK contrôle verrouillé : refus du verrou inchangé (%)', left(sqlerrm, 60);
    else raise notice 'KO contrôle verrouillé : refus inattendu : %', sqlerrm; end if;
  end;
end $$;
select case when vehicule_id = '00000000-0000-4000-8000-0000000000e1' and verrouille_le is not null then 'OK ' else 'KO ' end || 'contrôle verrouillé intact'
  from public.inspections where id = '00000000-0000-4000-8000-00000000d002';

update public.inspections set kilometrage = 12345 where id = '00000000-0000-4000-8000-00000000d001';
select 'OK modification ordinaire d''un contrôle (kilométrage) sans effet du nouveau trigger';

select case when count(*) = 0 then 'OK ' else 'KO ' end || 'aucune fonction nouvelle exécutable par anon ou authenticated'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('factures_une_par_ordre', 'inspections_client_vehicule_coherents')
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));

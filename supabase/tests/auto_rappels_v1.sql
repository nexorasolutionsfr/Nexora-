-- Nexora Auto — rappel du contrôle technique — banc AUTONOME et RÉVERSIBLE.
--
-- Présuppose 20260922000100 → 20260922001200 appliquées (et le débit commun
-- 20260921000200). Jamais Production. Marqueur « recette-auto-rappel- ».
-- Transaction jamais validée : rien ne reste, pas même un jeton de débit.
--
-- Ce que le banc prouve, en base :
--   1. sans consentement, rien n'est programmé ni réservé ;
--   2. le consentement est propre à Nexora Auto, porte l'adresse affichée, et
--      ne s'écrit que par les fonctions ;
--   3. 9 h heure de Paris, été comme hiver, jours de changement d'heure compris ;
--   4. un rappel dû part une fois : deux réservations ne donnent qu'une ligne,
--      une clôture rejouée ne change rien, une échéance déjà rappelée ne se
--      reprogramme pas ;
--   5. date corrigée → le rappel programmé est annulé au moment de partir et
--      reprogrammé sur la nouvelle date ;
--   6. nouveau contrôle enregistré → l'ancien rappel est annulé ;
--   7. voiture archivée → annulé ; voiture supprimée → plus aucune ligne ;
--   8. échec temporaire → reprise espacée, bornée à trois tentatives, puis
--      bloqué, chaque erreur gardée ;
--   9. issue incertaine → jamais reprise ;
--  10. désactivation → rien ne part plus ;
--  11. adresse du compte changée → bloqué jusqu'à confirmation ;
--  12. accès retiré → annulé ; trop tard → annulé ;
--  13. débit commun atteint → rien ne part, aucune tentative consommée.

begin;

do $$ begin update public.auto_acces_parametres set mode = 'ouvert'; end $$;

create temporary table _fixture_ids (cle text primary key, valeur uuid not null) on commit drop;

create function pg_temp.fid(p_cle text) returns uuid
language sql security definer set search_path = '' as $$
  select valeur from pg_temp._fixture_ids where cle = p_cle;
$$;
revoke execute on function pg_temp.fid(text) from public;
grant execute on function pg_temp.fid(text) to authenticated, anon, service_role;

create function pg_temp.memoriser(p_cle text, p_valeur uuid) returns void
language sql security definer set search_path = '' as $$
  insert into pg_temp._fixture_ids (cle, valeur) values (p_cle, p_valeur)
  on conflict (cle) do update set valeur = excluded.valeur;
$$;
revoke execute on function pg_temp.memoriser(text, uuid) from public;
grant execute on function pg_temp.memoriser(text, uuid) to authenticated, service_role;

create function pg_temp.assert(p_condition boolean, p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert(boolean, text) from public;
grant execute on function pg_temp.assert(boolean, text) to authenticated, anon, service_role;

create function pg_temp.connecter(p_cle text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid(p_cle)::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.fid(p_cle)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- L'adresse actuelle d'un compte de recette (auth.users n'est lisible ni par
-- authenticated ni par service_role : on ne le leur donne pas pour le banc).
create function pg_temp.email(p_cle text) returns text
language sql security definer set search_path = '' as $$
  select lower(email) from auth.users where id = pg_temp.fid(p_cle);
$$;
grant execute on function pg_temp.email(text) to authenticated, service_role;

-- Le plan que rendrait lib/auto/rappels.js pour une voiture et une date.
create function pg_temp.plan(p_abonnement uuid, p_vehicule uuid, p_echeance date, p_delai integer, p_empreinte text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'abonnement_id', p_abonnement, 'cle', 'controle_technique:' || p_vehicule || ':' || p_echeance,
    'echeance', p_echeance, 'jour', p_echeance - p_delai, 'palier', 'j' || p_delai,
    'fondement', 'officiel', 'provenance', 'proprietaire',
    'objet', 'Contrôle technique de votre voiture : avant le ' || p_echeance,
    'texte', 'Bonjour, texte de recette.', 'empreinte', p_empreinte)
$$;
grant execute on function pg_temp.plan(uuid, uuid, date, integer, text) to service_role;

-- Programme ce que lit auto_rappels_a_planifier pour UN propriétaire.
create function pg_temp.programmer(p_proprietaire uuid, p_echeance date) returns jsonb
language plpgsql as $$
declare
  v_plans jsonb := '[]'::jsonb;
  v_ligne record;
begin
  for v_ligne in select * from public.auto_rappels_a_planifier(array[p_proprietaire]) loop
    v_plans := v_plans || jsonb_build_array(pg_temp.plan(v_ligne.abonnement_id, (v_ligne.vehicule->>'id')::uuid, p_echeance, v_ligne.delai_jours, v_ligne.empreinte));
  end loop;
  return public.auto_planifier_rappels(v_plans, array[p_proprietaire]);
end;
$$;
grant execute on function pg_temp.programmer(uuid, date) to service_role;

-- Rend un rappel programmé dû maintenant (le temps passe, en recette).
create function pg_temp.rendre_du(p_proprietaire uuid) returns void
language sql security definer set search_path = '' as $$
  update public.auto_rappels_envois set prevu_le = now() - interval '1 minute'
   where proprietaire_id = p_proprietaire and statut = 'prevu';
$$;
grant execute on function pg_temp.rendre_du(uuid) to service_role;

insert into _fixture_ids (cle, valeur) values ('alice', gen_random_uuid()), ('bruno', gen_random_uuid());

insert into auth.users (id, aud, role, email, email_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('alice'), 'authenticated', 'authenticated', 'recette-auto-rappel-alice-' || pg_temp.fid('alice')::text || '@example.invalid', now(),
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('bruno'), 'authenticated', 'authenticated', 'recette-auto-rappel-bruno-' || pg_temp.fid('bruno')::text || '@example.invalid', now(),
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now());

-- =====================================================================
-- 1. Sans consentement, rien
-- =====================================================================
do $$
declare
  v_clio uuid;
  v_n integer;
begin
  perform pg_temp.connecter('alice');
  v_clio := public.auto_ajouter_vehicule('Renault', 'Clio', 2019);
  perform pg_temp.memoriser('clio', v_clio);
  insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle, resultat_controle, controle_valable_jusqu_au)
  values (v_clio, 'controle_technique', current_date - 700, 'periodique', 'favorable', current_date + 40);

  perform pg_temp.service();
  select count(*) into v_n from public.auto_rappels_a_planifier(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '1. sans consentement : aucun dossier à programmer');
  perform pg_temp.assert((pg_temp.programmer(pg_temp.fid('alice'), current_date + 40)->>'programmes')::int = 0, '1. sans consentement : rien de programmé');
  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '1. sans consentement : rien à réserver');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 2. Le consentement : propre à Nexora Auto, par les fonctions seulement
-- =====================================================================
do $$
declare
  v_r jsonb;
  v_n integer;
  v_state text;
  v_msg text;
  v_email text;
begin
  perform pg_temp.connecter('alice');
  v_state := null;
  begin
    insert into public.auto_rappels_abonnements (proprietaire_id, vehicule_id, adresse_consentie)
    values (pg_temp.fid('alice'), pg_temp.fid('clio'), 'x@example.invalid');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert(v_state = '42501', '2. écriture directe du consentement refusée (' || coalesce(v_state, 'aucune erreur') || ')');

  v_state := null;
  begin
    perform public.auto_activer_rappel(pg_temp.fid('clio'), 45);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert(v_state = '22023', '2. moment hors des choix proposés refusé');

  v_r := public.auto_activer_rappel(pg_temp.fid('clio'), 30);
  v_email := pg_temp.email('alice');
  perform pg_temp.assert((v_r->>'ok')::boolean and v_r->>'decision' = 'active' and v_r->>'adresse' = v_email, '2. activation : adresse du compte enregistrée — ' || v_r::text);
  perform pg_temp.memoriser('abonnement', (v_r->>'abonnement_id')::uuid);

  v_r := public.auto_activer_rappel(pg_temp.fid('clio'), 30);
  perform pg_temp.assert((v_r->>'inchange')::boolean, '2. même choix rejoué : rien ne change');

  select count(*) into v_n from public.auto_rappels_decisions where abonnement_id = pg_temp.fid('abonnement');
  perform pg_temp.assert(v_n = 1, '2. une seule décision journalisée pour une seule activation');

  select count(*) into v_n from public.auto_rappels_abonnements;
  perform pg_temp.assert(v_n = 1, '2. Alice lit son abonnement');
  reset role;

  perform pg_temp.connecter('bruno');
  select count(*) into v_n from public.auto_rappels_abonnements;
  perform pg_temp.assert(v_n = 0, '2. Bruno ne lit pas l''abonnement d''Alice');
  v_state := null;
  begin
    perform public.auto_activer_rappel(pg_temp.fid('clio'), 30);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert(v_state = 'P0002', '2. Bruno ne peut pas activer un rappel sur la voiture d''Alice');
  v_state := null;
  begin
    perform public.auto_etat_rappel(pg_temp.fid('clio'));
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert(v_state = 'P0002', '2. Bruno ne lit pas l''état du rappel d''Alice');
  v_state := null;
  begin
    perform public.auto_reserver_rappel(null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert(v_state = '42501', '2. une personne connectée ne peut pas réserver d''envoi');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 3. 9 h, heure de Paris
-- =====================================================================
do $$
begin
  perform pg_temp.service();
  perform pg_temp.assert(public.auto_rappel_neuf_heures(date '2028-05-19') = timestamptz '2028-05-19 07:00:00+00', '3. été : 9 h à Paris = 7 h UTC');
  perform pg_temp.assert(public.auto_rappel_neuf_heures(date '2028-12-01') = timestamptz '2028-12-01 08:00:00+00', '3. hiver : 9 h à Paris = 8 h UTC');
  perform pg_temp.assert(public.auto_rappel_neuf_heures(date '2028-03-26') = timestamptz '2028-03-26 07:00:00+00', '3. jour du passage à l''heure d''été');
  perform pg_temp.assert(public.auto_rappel_neuf_heures(date '2028-10-29') = timestamptz '2028-10-29 08:00:00+00', '3. jour du retour à l''heure d''hiver');
  -- Un jour passé : le prochain 9 h à Paris, jamais un instant passé.
  perform pg_temp.assert(public.auto_rappel_neuf_heures(current_date - 3) > now(), '3. jour passé : prochain 9 h, dans le futur');
  perform pg_temp.assert((public.auto_rappel_neuf_heures(current_date - 3) at time zone 'Europe/Paris')::time = time '09:00', '3. jour passé : toujours à 9 h');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 4. Programmer, réserver, envoyer : une seule fois
-- =====================================================================
do $$
declare
  v_r jsonb;
  v_ligne record;
  v_n integer;
  v_jetons integer;
begin
  perform pg_temp.service();
  select count(*) into v_jetons from public.envois_debit where file = 'auto_rappels';

  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 40);
  perform pg_temp.assert((v_r->>'programmes')::int = 1, '4. un rappel programmé — ' || v_r::text);
  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 40);
  perform pg_temp.assert((v_r->>'programmes')::int = 0 and (v_r->>'rafraichis')::int = 1, '4. reprogrammer : aucune seconde ligne — ' || v_r::text);

  select * into v_ligne from public.auto_rappels_envois where proprietaire_id = pg_temp.fid('alice');
  perform pg_temp.assert(v_ligne.palier = 'j30' and v_ligne.echeance = current_date + 40, '4. palier et échéance');
  perform pg_temp.assert((v_ligne.prevu_le at time zone 'Europe/Paris') = ((current_date + 10)::timestamp + time '09:00'), '4. moment : 30 jours avant, 9 h à Paris');

  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '4. pas encore dû : rien à réserver');

  perform pg_temp.rendre_du(pg_temp.fid('alice'));
  select * into v_ligne from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_ligne.ref is not null and v_ligne.tentatives = 1, '4. dû : réservé, première tentative');
  perform pg_temp.assert(v_ligne.destinataire = pg_temp.email('alice'), '4. destinataire = adresse consentie');
  perform pg_temp.memoriser('ref1', v_ligne.ref);

  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '4. seconde réservation : rien (aucun doublon)');

  select count(*) - v_jetons into v_n from public.envois_debit where file = 'auto_rappels';
  perform pg_temp.assert(v_n = 1, '4. un jeton du débit commun, pris pour cet envoi');

  v_r := public.auto_terminer_rappel(pg_temp.fid('ref1'), 'envoye', null);
  perform pg_temp.assert(v_r->>'statut' = 'envoye', '4. clôture : envoyé');
  v_r := public.auto_terminer_rappel(pg_temp.fid('ref1'), 'envoye', null);
  perform pg_temp.assert(not (v_r->>'clos')::boolean and v_r->>'raison' = 'deja_clos', '4. clôture rejouée : sans effet');

  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 40);
  select count(*) into v_n from public.auto_rappels_envois where proprietaire_id = pg_temp.fid('alice');
  perform pg_temp.assert(v_n = 1 and (v_r->>'programmes')::int = 0, '4. échéance déjà rappelée : jamais reprogrammée');
  reset role;
end;
$$;
reset role;

-- État lu par l'écran après l'envoi.
do $$
declare
  v_etat jsonb;
begin
  perform pg_temp.connecter('alice');
  v_etat := public.auto_etat_rappel(pg_temp.fid('clio'));
  perform pg_temp.assert((v_etat->'abonnement'->>'actif')::boolean and (v_etat->'abonnement'->>'delai_jours')::int = 30, '4. écran : abonnement actif, 30 jours');
  perform pg_temp.assert(v_etat->'dernier_envoye'->>'envoye_le' is not null and v_etat->'prochain' = 'null'::jsonb, '4. écran : dernier envoi visible, rien de prévu — ' || v_etat::text);
  perform pg_temp.assert(v_etat::text not like '%texte de recette%', '4. écran : le texte n''est pas exposé');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 5. Date corrigée, 6. nouveau contrôle
-- =====================================================================
do $$
declare
  v_ligne record;
  v_n integer;
  v_r jsonb;
begin
  -- Une nouvelle échéance (le rappel précédent est parti) : un contrôle plus
  -- récent, déclaré avec une date de procès-verbal.
  perform pg_temp.connecter('alice');
  insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle, resultat_controle, controle_valable_jusqu_au)
  values (pg_temp.fid('clio'), 'controle_technique', current_date - 20, 'periodique', 'favorable', current_date + 50);
  reset role;

  perform pg_temp.service();
  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 50);
  perform pg_temp.assert((v_r->>'programmes')::int = 1, '6. nouveau contrôle : un nouveau rappel sur la nouvelle échéance');

  -- 5. La date est corrigée APRÈS la programmation, et le programmateur n'est
  --    pas repassé : au moment de partir, le rappel est annulé.
  reset role;
  perform pg_temp.connecter('alice');
  update public.auto_historique set controle_valable_jusqu_au = current_date + 55
   where vehicule_id = pg_temp.fid('clio') and realise_le = current_date - 20;
  reset role;

  perform pg_temp.service();
  perform pg_temp.rendre_du(pg_temp.fid('alice'));
  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '5. date corrigée : le rappel calculé sur l''ancienne date ne part pas');
  select * into v_ligne from public.auto_rappels_envois
   where proprietaire_id = pg_temp.fid('alice') and echeance = current_date + 50;
  perform pg_temp.assert(v_ligne.statut = 'annule' and v_ligne.motif like 'dossier modifié%', '5. annulé avec son motif — ' || coalesce(v_ligne.motif, '∅'));

  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 55);
  select * into v_ligne from public.auto_rappels_envois
   where proprietaire_id = pg_temp.fid('alice') and statut = 'prevu';
  perform pg_temp.assert(v_ligne.echeance = current_date + 55 and (v_ligne.prevu_le at time zone 'Europe/Paris') = ((current_date + 25)::timestamp + time '09:00'),
    '5. reprogrammé sur la date corrigée, 30 jours avant, 9 h');

  -- 6 bis. Un contrôle enregistré alors qu'un rappel est programmé : le rappel
  --        de l'ancienne échéance est annulé par le programmateur.
  reset role;
  perform pg_temp.connecter('alice');
  insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle, resultat_controle, controle_valable_jusqu_au)
  values (pg_temp.fid('clio'), 'controle_technique', current_date - 1, 'periodique', 'favorable', current_date + 729);
  reset role;
  perform pg_temp.service();
  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 729);
  select count(*) into v_n from public.auto_rappels_envois
   where proprietaire_id = pg_temp.fid('alice') and echeance = current_date + 55 and statut = 'annule' and motif like 'échéance ou moment modifiés%';
  perform pg_temp.assert(v_n = 1, '6. nouveau contrôle : l''ancien rappel est annulé');
  select count(*) into v_n from public.auto_rappels_envois
   where proprietaire_id = pg_temp.fid('alice') and statut = 'prevu' and echeance = current_date + 729;
  perform pg_temp.assert(v_n = 1, '6. et le rappel suit la nouvelle échéance');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 8. Échec temporaire : reprise espacée, bornée, tracée
-- 9. Issue incertaine : jamais reprise
-- =====================================================================
do $$
declare
  v_ligne record;
  v_r jsonb;
  v_n integer;
begin
  perform pg_temp.service();
  perform pg_temp.rendre_du(pg_temp.fid('alice'));

  select * into v_ligne from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.memoriser('ref2', v_ligne.ref);
  v_r := public.auto_terminer_rappel(v_ligne.ref, 'a_reprendre', 'refus temporaire du fournisseur avant le message : 451');
  perform pg_temp.assert(v_r->>'statut' = 'prevu', '8. première erreur temporaire : remis en file');
  select * into v_ligne from public.auto_rappels_envois where ref = pg_temp.fid('ref2');
  perform pg_temp.assert(v_ligne.prochain_essai_le between now() + interval '29 minutes' and now() + interval '31 minutes', '8. reprise dans 30 minutes, pas tout de suite');
  perform pg_temp.assert(v_ligne.derniere_erreur like 'refus temporaire%', '8. erreur gardée');

  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '8. pas de nouvelle tentative avant le délai');

  update public.auto_rappels_envois set prochain_essai_le = now() - interval '1 second' where ref = pg_temp.fid('ref2');
  select * into v_ligne from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_ligne.tentatives = 2, '8. deuxième tentative');
  v_r := public.auto_terminer_rappel(v_ligne.ref, 'a_reprendre', 'refus temporaire du fournisseur avant le message : 421');
  select * into v_ligne from public.auto_rappels_envois where ref = pg_temp.fid('ref2');
  perform pg_temp.assert(v_ligne.prochain_essai_le between now() + interval '119 minutes' and now() + interval '121 minutes', '8. puis dans 2 heures');

  update public.auto_rappels_envois set prochain_essai_le = now() - interval '1 second' where ref = pg_temp.fid('ref2');
  select * into v_ligne from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_ligne.tentatives = 3, '8. troisième et dernière tentative');
  v_r := public.auto_terminer_rappel(v_ligne.ref, 'a_reprendre', 'refus temporaire du fournisseur avant le message : 451');
  select * into v_ligne from public.auto_rappels_envois where ref = pg_temp.fid('ref2');
  perform pg_temp.assert(v_ligne.statut = 'bloque' and v_ligne.motif like 'trois tentatives%' and v_ligne.derniere_erreur like '%451%', '8. bloqué après trois tentatives, erreur gardée');

  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '8. un rappel bloqué ne repart pas');
  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 729);
  select statut into v_ligne from public.auto_rappels_envois where ref = pg_temp.fid('ref2');
  perform pg_temp.assert(v_ligne.statut = 'bloque', '8. le programmateur ne relance pas un rappel bloqué');
  reset role;
end;
$$;
reset role;

-- La personne réactive : le rappel bloqué est annulé puis reprogrammé.
do $$
declare
  v_r jsonb;
  v_ligne record;
  v_n integer;
begin
  perform pg_temp.connecter('alice');
  v_r := public.auto_activer_rappel(pg_temp.fid('clio'), 15);
  perform pg_temp.assert(v_r->>'decision' = 'modifie', '8. changer le moment : décision « modifié »');
  reset role;

  perform pg_temp.service();
  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 729);
  select * into v_ligne from public.auto_rappels_envois where proprietaire_id = pg_temp.fid('alice') and statut = 'prevu';
  perform pg_temp.assert(v_ligne.palier = 'j15' and (v_ligne.prevu_le at time zone 'Europe/Paris') = ((current_date + 714)::timestamp + time '09:00'), '8. reprogrammé 15 jours avant, 9 h');

  -- 9. Issue incertaine : la ligne réservée n'est pas close ; elle ne repart pas.
  perform pg_temp.rendre_du(pg_temp.fid('alice'));
  select * into v_ligne from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.memoriser('ref3', v_ligne.ref);
  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '9. issue incertaine : jamais reprise');
  v_r := pg_temp.programmer(pg_temp.fid('alice'), current_date + 729);
  select count(*) into v_n from public.auto_rappels_envois where proprietaire_id = pg_temp.fid('alice') and statut in ('prevu', 'envoi_en_cours');
  perform pg_temp.assert(v_n = 1, '9. le programmateur ne double pas un envoi incertain');
  -- La vérification humaine conclut : il est parti.
  perform public.auto_terminer_rappel(pg_temp.fid('ref3'), 'envoye', null);
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 10. Désactivation — 11. adresse changée — 12. accès retiré, trop tard
-- =====================================================================
do $$
declare
  v_r jsonb;
  v_ligne record;
  v_n integer;
  v_c3 uuid;
begin
  -- Une seconde voiture, pour repartir d'un rappel programmé.
  perform pg_temp.connecter('alice');
  v_c3 := public.auto_ajouter_vehicule('Citroën', 'C3', 2016);
  perform pg_temp.memoriser('c3', v_c3);
  insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle, resultat_controle, controle_valable_jusqu_au)
  values (v_c3, 'controle_technique', current_date - 600, 'periodique', 'favorable', current_date + 90);
  perform public.auto_activer_rappel(v_c3, 60);
  reset role;

  perform pg_temp.service();
  -- programmer() lit tous les abonnements d'Alice ; seule la C3 a une échéance à venir ici.
  v_r := public.auto_planifier_rappels(jsonb_build_array(pg_temp.plan(
    (select id from public.auto_rappels_abonnements where vehicule_id = v_c3), v_c3, current_date + 90, 60, public.auto_empreinte_ct(v_c3))), array[pg_temp.fid('alice')]);
  perform pg_temp.assert((v_r->>'programmes')::int = 1, '10. C3 : programmé');
  reset role;

  -- 10. Désactivation.
  perform pg_temp.connecter('alice');
  v_r := public.auto_desactiver_rappel(v_c3);
  perform pg_temp.assert((v_r->>'annules')::int = 1, '10. arrêter : le rappel programmé est annulé');
  v_r := public.auto_desactiver_rappel(v_c3);
  perform pg_temp.assert((v_r->>'deja_inactif')::boolean, '10. arrêter deux fois : sans effet');
  select count(*) into v_n from public.auto_rappels_decisions where decision = 'desactive';
  perform pg_temp.assert(v_n = 1, '10. arrêt journalisé');
  reset role;
  perform pg_temp.service();
  perform pg_temp.rendre_du(pg_temp.fid('alice'));
  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '10. désactivé : rien ne part');
  select count(*) into v_n from public.auto_rappels_a_planifier(array[pg_temp.fid('alice')]) where (vehicule->>'id')::uuid = v_c3;
  perform pg_temp.assert(v_n = 0, '10. désactivé : plus rien à programmer pour cette voiture');
  reset role;

  -- 11. Adresse du compte changée après l'activation : bloqué, puis confirmé.
  perform pg_temp.connecter('alice');
  perform public.auto_activer_rappel(v_c3, 60);
  reset role;
  perform pg_temp.service();
  v_r := public.auto_planifier_rappels(jsonb_build_array(pg_temp.plan(
    (select id from public.auto_rappels_abonnements where vehicule_id = v_c3), v_c3, current_date + 90, 60, public.auto_empreinte_ct(v_c3))), array[pg_temp.fid('alice')]);
  reset role;
  update auth.users set email = 'recette-auto-rappel-alice-nouvelle-' || pg_temp.fid('alice')::text || '@example.invalid' where id = pg_temp.fid('alice');
  perform pg_temp.service();
  perform pg_temp.rendre_du(pg_temp.fid('alice'));
  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '11. adresse changée : rien ne part vers l''ancienne ni vers la nouvelle');
  select * into v_ligne from public.auto_rappels_envois where vehicule_id = v_c3 and palier = 'j60';
  perform pg_temp.assert(v_ligne.statut = 'bloque' and v_ligne.motif like 'adresse du compte changée%', '11. bloqué, motif dit — ' || coalesce(v_ligne.motif, '∅'));
  reset role;
  perform pg_temp.connecter('alice');
  v_r := public.auto_activer_rappel(v_c3, 60);
  perform pg_temp.assert(v_r->>'decision' = 'confirme' and v_r->>'adresse' like 'recette-auto-rappel-alice-nouvelle-%', '11. la personne confirme la nouvelle adresse');
  reset role;
  perform pg_temp.service();
  v_r := public.auto_planifier_rappels(jsonb_build_array(pg_temp.plan(
    (select id from public.auto_rappels_abonnements where vehicule_id = v_c3), v_c3, current_date + 90, 60, public.auto_empreinte_ct(v_c3))), array[pg_temp.fid('alice')]);
  perform pg_temp.rendre_du(pg_temp.fid('alice'));
  select * into v_ligne from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_ligne.destinataire like 'recette-auto-rappel-alice-nouvelle-%', '11. après confirmation : part vers la nouvelle adresse');
  perform public.auto_terminer_rappel(v_ligne.ref, 'envoye', null);
  reset role;
end;
$$;
reset role;

do $$
declare
  v_r jsonb;
  v_ligne record;
  v_n integer;
  v_golf uuid;
begin
  -- 12. Accès retiré, puis échéance atteinte avant l'envoi.
  perform pg_temp.connecter('alice');
  v_golf := public.auto_ajouter_vehicule('Volkswagen', 'Golf', 2018);
  perform pg_temp.memoriser('golf', v_golf);
  insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle, resultat_controle, controle_valable_jusqu_au)
  values (v_golf, 'controle_technique', current_date - 700, 'periodique', 'favorable', current_date + 45);
  perform public.auto_activer_rappel(v_golf, 30);
  reset role;
  perform pg_temp.service();
  v_r := public.auto_planifier_rappels(jsonb_build_array(pg_temp.plan(
    (select id from public.auto_rappels_abonnements where vehicule_id = v_golf), v_golf, current_date + 45, 30, public.auto_empreinte_ct(v_golf))), array[pg_temp.fid('alice')]);
  reset role;

  update public.auto_acces_parametres set mode = 'ferme';
  perform pg_temp.service();
  select count(*) into v_n from public.auto_rappels_a_planifier(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '12. accès fermé : plus rien à programmer');
  perform pg_temp.rendre_du(pg_temp.fid('alice'));
  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '12. accès fermé : rien ne part');
  select * into v_ligne from public.auto_rappels_envois where vehicule_id = v_golf;
  perform pg_temp.assert(v_ligne.statut = 'annule' and v_ligne.motif like 'accès à Nexora Auto retiré%', '12. annulé, motif dit');
  reset role;
  update public.auto_acces_parametres set mode = 'ouvert';

  -- L'accès revient : le rappel revit.
  perform pg_temp.service();
  v_r := public.auto_planifier_rappels(jsonb_build_array(pg_temp.plan(
    (select id from public.auto_rappels_abonnements where vehicule_id = v_golf), v_golf, current_date + 45, 30, public.auto_empreinte_ct(v_golf))), array[pg_temp.fid('alice')]);
  select * into v_ligne from public.auto_rappels_envois where vehicule_id = v_golf;
  perform pg_temp.assert(v_ligne.statut = 'prevu', '12. accès rendu : le rappel revit');

  -- Trop tard : l'échéance est atteinte avant le passage (n8n arrêté).
  update public.auto_rappels_envois set echeance = current_date, prevu_le = now() - interval '5 days' where vehicule_id = v_golf;
  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')]);
  perform pg_temp.assert(v_n = 0, '12. échéance atteinte : ne part plus');
  select * into v_ligne from public.auto_rappels_envois where vehicule_id = v_golf;
  perform pg_temp.assert(v_ligne.statut = 'annule' and v_ligne.motif like 'échéance atteinte%', '12. annulé : trop tard pour être utile');

  -- Programmer une échéance déjà atteinte : rien n'est créé. (Une échéance
  -- demain reste rappelée ce matin si 9 h n'est pas passé : c'est voulu.)
  v_r := public.auto_planifier_rappels(jsonb_build_array(pg_temp.plan(
    (select id from public.auto_rappels_abonnements where vehicule_id = v_golf), v_golf, current_date, 30, public.auto_empreinte_ct(v_golf))), array[pg_temp.fid('alice')]);
  perform pg_temp.assert((v_r->>'programmes')::int = 0, '12. échéance aujourd''hui : aucun rappel programmé');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 7. Voiture archivée, voiture supprimée
-- =====================================================================
do $$
declare
  v_r jsonb;
  v_ligne record;
  v_n integer;
begin
  perform pg_temp.connecter('alice');
  update public.auto_historique set controle_valable_jusqu_au = current_date + 70 where vehicule_id = pg_temp.fid('golf');
  reset role;
  perform pg_temp.service();
  v_r := public.auto_planifier_rappels(jsonb_build_array(pg_temp.plan(
    (select id from public.auto_rappels_abonnements where vehicule_id = pg_temp.fid('golf')), pg_temp.fid('golf'), current_date + 70, 30, public.auto_empreinte_ct(pg_temp.fid('golf')))), array[pg_temp.fid('alice')]);
  perform pg_temp.assert((v_r->>'programmes')::int = 1, '7. Golf : programmé');
  reset role;

  perform pg_temp.connecter('alice');
  perform public.auto_archiver_vehicule(pg_temp.fid('golf'), true);
  reset role;
  perform pg_temp.service();
  select count(*) into v_n from public.auto_rappels_a_planifier(array[pg_temp.fid('alice')]) where (vehicule->>'id')::uuid = pg_temp.fid('golf');
  perform pg_temp.assert(v_n = 0, '7. archivée : plus rien à programmer');
  v_r := public.auto_planifier_rappels('[]'::jsonb, array[pg_temp.fid('alice')]);
  select * into v_ligne from public.auto_rappels_envois where vehicule_id = pg_temp.fid('golf') and echeance = current_date + 70;
  perform pg_temp.assert(v_ligne.statut = 'annule' and v_ligne.motif like 'voiture archivée%', '7. archivée : le rappel programmé est annulé');
  reset role;

  perform pg_temp.connecter('alice');
  delete from public.auto_vehicules where id = pg_temp.fid('golf');
  reset role;
  select count(*) into v_n from public.auto_rappels_envois where vehicule_id = pg_temp.fid('golf');
  perform pg_temp.assert(v_n = 0, '7. supprimée : plus aucune ligne de rappel');
  select count(*) into v_n from public.auto_rappels_abonnements where vehicule_id = pg_temp.fid('golf');
  perform pg_temp.assert(v_n = 0, '7. supprimée : plus d''abonnement');
end;
$$;
reset role;

-- =====================================================================
-- 13. Débit commun atteint
-- =====================================================================
do $$
declare
  v_r jsonb;
  v_ligne record;
  v_n integer;
  v_c3 uuid := pg_temp.fid('c3');
begin
  perform pg_temp.connecter('alice');
  update public.auto_historique set controle_valable_jusqu_au = current_date + 100 where vehicule_id = v_c3;
  reset role;
  perform pg_temp.service();
  v_r := public.auto_planifier_rappels(jsonb_build_array(pg_temp.plan(
    (select id from public.auto_rappels_abonnements where vehicule_id = v_c3), v_c3, current_date + 100, 60, public.auto_empreinte_ct(v_c3))), array[pg_temp.fid('alice')]);
  perform pg_temp.rendre_du(pg_temp.fid('alice'));
  -- Plafond volontairement bas : 1 par heure, et un jeton vient d'être pris.
  perform public.prendre_jeton_envoi('auto_rappels', gen_random_uuid(), 1000, 1000, 'banc');
  select count(*) into v_n from public.auto_reserver_rappel(array[pg_temp.fid('alice')], 1, 1000, 'banc');
  perform pg_temp.assert(v_n = 0, '13. débit atteint : rien ne part');
  select * into v_ligne from public.auto_rappels_envois where vehicule_id = v_c3 and echeance = current_date + 100;
  perform pg_temp.assert(v_ligne.statut = 'prevu' and v_ligne.tentatives = 0 and v_ligne.derniere_erreur like 'report : plafond%', '13. reste programmé, aucune tentative consommée, report tracé');
  -- Les files du compte garage gardent leur débit : la fonction les accepte toujours.
  v_r := public.prendre_jeton_envoi('devis', gen_random_uuid(), 1000, 1000, 'banc');
  perform pg_temp.assert((v_r->>'ok')::boolean, '13. le débit commun sert toujours les files du compte garage');
  reset role;
end;
$$;
reset role;

do $$ begin raise notice 'RECETTE AUTO RAPPELS : tous les contrôles sont passés'; end; $$;

rollback;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from auth.users where email like 'recette-auto-rappel-%@example.invalid';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — % compte(s) de recette encore present(s)', v_n;
  end if;
end;
$$;

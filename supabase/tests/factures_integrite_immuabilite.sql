-- Banc des deux garanties ajoutées sur factures :
--   20260904000900_factures_check_integrite.sql
--   20260904001000_factures_immuabilite.sql
--
-- Un seul bloc autonome : il crée ses fixtures, joue les assertions, puis
-- lève volontairement une exception finale qui annule TOUT (fixtures
-- comprises) et remonte le rapport. Aucune donnée ne survit à l'exécution,
-- donc aucun nettoyage à faire. À exécuter sur Test uniquement.
--
-- Attendu : l'exécution se termine par une erreur dont le message commence
-- par « BANC OK » et liste chaque assertion. Toute autre erreur est un échec.
do $$
declare
  v_garage_a uuid; v_garage_b uuid;
  v_client_a uuid; v_client_b uuid;
  v_vehicule_a uuid; v_vehicule_b uuid;
  v_rdv_a uuid; v_rdv_b uuid; v_rdv_a2 uuid;
  v_or_a uuid; v_or_b uuid;
  v_facture uuid;
  v_rapport text := '';
  v_echecs text := '';
begin
  -- ----- Fixtures : deux garages étanches -----
  insert into public.garages (nom_garage, email, telephone, adresse)
    values ('BANC Garage A', 'banc-a@invalid', '0000000000', 'Banc A') returning id into v_garage_a;
  insert into public.garages (nom_garage, email, telephone, adresse)
    values ('BANC Garage B', 'banc-b@invalid', '0000000000', 'Banc B') returning id into v_garage_b;

  insert into public.clients (garage_id, nom) values (v_garage_a, 'BANC Client A') returning id into v_client_a;
  insert into public.clients (garage_id, nom) values (v_garage_b, 'BANC Client B') returning id into v_client_b;

  insert into public.vehicules (garage_id, client_id, marque, immatriculation)
    values (v_garage_a, v_client_a, 'BANC', 'BANC-A-01') returning id into v_vehicule_a;
  insert into public.vehicules (garage_id, client_id, marque, immatriculation)
    values (v_garage_b, v_client_b, 'BANC', 'BANC-B-01') returning id into v_vehicule_b;

  insert into public.rendez_vous (garage_id, client_id, vehicule_id, date_debut, date_fin, statut, source)
    values (v_garage_a, v_client_a, v_vehicule_a, now(), now() + interval '1 hour', 'confirme', 'manuel') returning id into v_rdv_a;
  insert into public.rendez_vous (garage_id, client_id, vehicule_id, date_debut, date_fin, statut, source)
    values (v_garage_a, v_client_a, v_vehicule_a, now() + interval '3 hours', now() + interval '4 hours', 'confirme', 'manuel') returning id into v_rdv_a2;
  insert into public.rendez_vous (garage_id, client_id, vehicule_id, date_debut, date_fin, statut, source)
    values (v_garage_b, v_client_b, v_vehicule_b, now(), now() + interval '1 hour', 'confirme', 'manuel') returning id into v_rdv_b;

  insert into public.ordres_reparation (garage_id, rendez_vous_id, vehicule_id, client_id, statut)
    values (v_garage_a, v_rdv_a, v_vehicule_a, v_client_a, 'termine') returning id into v_or_a;
  insert into public.ordres_reparation (garage_id, rendez_vous_id, vehicule_id, client_id, statut)
    values (v_garage_b, v_rdv_b, v_vehicule_b, v_client_b, 'termine') returning id into v_or_b;

  -- ----- 1. Intégrité inter-garages -----

  -- 1.1 REFUSÉ : OR d'un autre garage.
  begin
    insert into public.factures (garage_id, client_id, vehicule_id, rendez_vous_id, ordre_reparation_id, numero, montant_ht, montant_ttc, statut)
      values (v_garage_a, v_client_a, v_vehicule_a, v_rdv_a, v_or_b, 'BANC-1', 10, 12, 'en_attente');
    v_echecs := v_echecs || '1.1(OR autre garage accepte) ';
  exception when others then
    if sqlerrm not like '%autre garage%' then v_echecs := v_echecs || '1.1(mauvais message: ' || sqlerrm || ') ';
    else v_rapport := v_rapport || E'\n  OK 1.1 — OR d''un autre garage refuse'; end if;
  end;

  -- 1.2 REFUSÉ : OR du bon garage, mais rattaché à un autre rendez-vous.
  begin
    insert into public.factures (garage_id, client_id, vehicule_id, rendez_vous_id, ordre_reparation_id, numero, montant_ht, montant_ttc, statut)
      values (v_garage_a, v_client_a, v_vehicule_a, v_rdv_a2, v_or_a, 'BANC-2', 10, 12, 'en_attente');
    v_echecs := v_echecs || '1.2(OR autre rendez-vous accepte) ';
  exception when others then
    if sqlerrm not like '%ne correspond pas au rendez_vous%' then v_echecs := v_echecs || '1.2(mauvais message: ' || sqlerrm || ') ';
    else v_rapport := v_rapport || E'\n  OK 1.2 — OR rattache a un autre rendez-vous refuse'; end if;
  end;

  -- 1.3 ACCEPTÉ : cas nominal.
  insert into public.factures (garage_id, client_id, vehicule_id, rendez_vous_id, ordre_reparation_id, numero, montant_ht, montant_ttc, statut, lignes)
    values (v_garage_a, v_client_a, v_vehicule_a, v_rdv_a, v_or_a, 'BANC-3', 100, 120, 'en_attente',
            '[{"description":"BANC ligne","quantite":1,"prix_unitaire_ht":100,"taux_tva":20}]'::jsonb)
    returning id into v_facture;
  v_rapport := v_rapport || E'\n  OK 1.3 — facture nominale acceptee';

  -- 1.4 REFUSÉ : réattribution après coup.
  begin
    update public.factures set ordre_reparation_id = v_or_b where id = v_facture;
    v_echecs := v_echecs || '1.4(reattribution acceptee) ';
  exception when others then
    v_rapport := v_rapport || E'\n  OK 1.4 — reattribution de l''OR refusee';
  end;

  -- ----- 2. Ancrages figés dès la création -----
  begin
    update public.factures set garage_id = v_garage_b where id = v_facture;
    v_echecs := v_echecs || '2(garage_id) ';
  exception when others then null; end;
  begin
    update public.factures set rendez_vous_id = null where id = v_facture;
    v_echecs := v_echecs || '2(rendez_vous_id) ';
  exception when others then null; end;
  begin
    update public.factures set numero = 'BANC-AUTRE' where id = v_facture;
    v_echecs := v_echecs || '2(numero) ';
  exception when others then null; end;
  begin
    update public.factures set client_id = v_client_b where id = v_facture;
    v_echecs := v_echecs || '2(client_id) ';
  exception when others then null; end;
  v_rapport := v_rapport || E'\n  OK 2 — ancrages figes : garage, rendez-vous, numero, client';

  -- ----- 3. Avant paiement : correction légitime autorisée -----
  update public.factures
     set lignes = '[{"description":"BANC corrige","quantite":2,"prix_unitaire_ht":50,"taux_tva":20}]'::jsonb,
         montant_ht = 100, montant_ttc = 120, motif = 'BANC motif corrige'
   where id = v_facture;
  v_rapport := v_rapport || E'\n  OK 3 — correction des lignes avant encaissement autorisee';

  -- ----- 4. Paiement, puis verrouillage définitif -----
  update public.factures set statut = 'payee', date_paiement = now() where id = v_facture;
  v_rapport := v_rapport || E'\n  OK 4.0 — marquage payee autorise';

  begin
    update public.factures set lignes = '[]'::jsonb where id = v_facture;
    v_echecs := v_echecs || '4(lignes) ';
  exception when others then null; end;
  begin
    update public.factures set montant_ttc = 1 where id = v_facture;
    v_echecs := v_echecs || '4(montant_ttc) ';
  exception when others then null; end;
  begin
    update public.factures set statut = 'en_attente' where id = v_facture;
    v_echecs := v_echecs || '4(retour arriere statut) ';
  exception when others then null; end;
  begin
    update public.factures set date_paiement = null where id = v_facture;
    v_echecs := v_echecs || '4(effacement date_paiement) ';
  exception when others then null; end;
  v_rapport := v_rapport || E'\n  OK 4 — facture payee definitive : lignes, montants, statut, date de paiement';

  -- ----- 5. Le motif reste modifiable : texte, aucun montant -----
  update public.factures set motif = 'BANC motif apres paiement' where id = v_facture;
  v_rapport := v_rapport || E'\n  OK 5 — motif toujours modifiable apres paiement';

  if v_echecs <> '' then
    raise exception 'BANC ECHEC — assertions non tenues : %', v_echecs;
  end if;

  -- Sortie volontaire en exception : annule fixtures et assertions.
  raise exception 'BANC OK — toutes les assertions sont tenues.%', v_rapport;
end $$;

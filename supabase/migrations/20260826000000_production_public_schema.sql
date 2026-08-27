


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."assigner_numero_facture"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  nouveau_numero integer;
  begin
    update garages set dernier_numero_facture = dernier_numero_facture + 1
      where id = new.garage_id
        returning dernier_numero_facture into nouveau_numero;
          new.numero := 'F-' || extract(year from now())::text || '-' || lpad(nouveau_numero::text, 4, '0');
            return new;
            end;
            $$;


ALTER FUNCTION "public"."assigner_numero_facture"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avancer_etape_atelier"("rdv_id" "uuid", "nouveau_statut" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if nouveau_statut not in ('a_venir','depose','diagnostic','attente_client','attente_piece','intervention','pret','restitue') then
    raise exception 'Statut invalide';
  end if;
  update rendez_vous set statut_atelier = nouveau_statut where id = rdv_id;
end;
$$;


ALTER FUNCTION "public"."avancer_etape_atelier"("rdv_id" "uuid", "nouveau_statut" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_garage_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$ select id from garages where owner_user_id = auth.uid() $$;


ALTER FUNCTION "public"."current_garage_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lire_devis_public"("p_devis_id" "uuid") RETURNS TABLE("client_nom" "text", "vehicule" "text", "prestation" "text", "montant_ttc" numeric, "statut" "text", "garage_nom" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select c.nom, concat(v.marque, ' ', v.modele), p.nom, d.montant_ttc, d.statut, g.nom_garage from devis d left join clients c on c.id = d.client_id left join vehicules v on v.id = d.vehicule_id left join prestations p on p.id = d.prestation_id left join garages g on g.id = d.garage_id where d.id = p_devis_id; $$;


ALTER FUNCTION "public"."lire_devis_public"("p_devis_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lire_etape_atelier"("rdv_id" "uuid") RETURNS TABLE("client" "text", "vehicule" "text", "prestation" "text", "statut_atelier" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select c.nom, concat(v.marque, ' ', v.modele), p.nom, r.statut_atelier
  from rendez_vous r
  left join clients c on c.id = r.client_id
  left join vehicules v on v.id = r.vehicule_id
  left join prestations p on p.id = r.prestation_id
  where r.id = rdv_id;
$$;


ALTER FUNCTION "public"."lire_etape_atelier"("rdv_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lire_facture_publique"("p_facture_id" "uuid") RETURNS TABLE("numero" "text", "garage_nom" "text", "vehicule" "text", "motif" "text", "montant_ht" numeric, "montant_ttc" numeric, "statut" "text", "lignes" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin return query select f.numero, g.nom_garage, trim(concat(v.marque, ' ', v.modele)), f.motif, f.montant_ht, f.montant_ttc, f.statut, f.lignes from factures f join garages g on g.id = f.garage_id left join vehicules v on v.id = f.vehicule_id where f.id = p_facture_id; end; $$;


ALTER FUNCTION "public"."lire_facture_publique"("p_facture_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifications_vehicule_pret_en_attente"() RETURNS TABLE("notification_id" "uuid", "rendez_vous_id" "uuid", "client_nom" "text", "client_email" "text", "vehicule" "text", "garage_nom" "text", "lien_paiement" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select n.id, r.id, c.nom, c.email, concat(v.marque, ' ', v.modele), g.nom_garage, r.lien_paiement from notifications_atelier n join rendez_vous r on r.id = n.rendez_vous_id left join clients c on c.id = r.client_id left join vehicules v on v.id = r.vehicule_id left join garages g on g.id = r.garage_id where n.envoye = false and n.type = 'vehicule_pret'; $$;


ALTER FUNCTION "public"."notifications_vehicule_pret_en_attente"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifier_devis_maj"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      begin
        if new.statut = 'accepte' and old.statut is distinct from 'accepte' then    insert into notifications_devis (devis_id, type) values (new.id, 'accepte');
          elsif new.statut = 'refuse' and old.statut is distinct from 'refuse' then    insert into notifications_devis (devis_id, type) values (new.id, 'refuse');
            end if;
              return new;
              end;
              $$;


ALTER FUNCTION "public"."notifier_devis_maj"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifier_facture_payee"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin if new.statut = 'payee' and old.statut is distinct from 'payee' then insert into notifications_factures (facture_id, type) values (new.id, 'payee'); end if; return new; end; $$;


ALTER FUNCTION "public"."notifier_facture_payee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifier_nouveau_devis"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.statut = 'en_attente' then    insert into notifications_devis (devis_id, type) values (new.id, 'nouveau');
    end if;
      return new;
      end;
      $$;


ALTER FUNCTION "public"."notifier_nouveau_devis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifier_nouvelle_facture"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin insert into notifications_factures (facture_id, type) values (new.id, 'nouvelle'); return new; end; $$;


ALTER FUNCTION "public"."notifier_nouvelle_facture"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifier_proposition_maj"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin if new.statut = 'accepte' and (old.statut is distinct from 'accepte') then insert into notifications_proposition (proposition_id, type) values (new.id, 'accepte'); elsif new.statut = 'refuse' and (old.statut is distinct from 'refuse') then insert into notifications_proposition (proposition_id, type) values (new.id, 'refuse'); elsif new.statut = 'en_attente' and old.statut = 'en_attente' and (new.date_debut_proposee is distinct from old.date_debut_proposee) then insert into notifications_proposition (proposition_id, type) values (new.id, 'reschedule'); end if; return new; end; $$;


ALTER FUNCTION "public"."notifier_proposition_maj"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notifier_vehicule_pret"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin if new.statut_atelier = 'pret' and (old.statut_atelier is distinct from 'pret') then insert into notifications_atelier (rendez_vous_id, type) values (new.id, 'vehicule_pret'); end if; return new; end; $$;


ALTER FUNCTION "public"."notifier_vehicule_pret"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."repondre_devis_public"("p_devis_id" "uuid", "p_reponse" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin if p_reponse not in ('accepte', 'refuse') then raise exception 'Reponse invalide'; end if; update devis set statut = p_reponse, date_validation = now() where id = p_devis_id and statut = 'en_attente'; end; $$;


ALTER FUNCTION "public"."repondre_devis_public"("p_devis_id" "uuid", "p_reponse" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_stripe_secret_key"("p_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ declare v_garage_id uuid; begin select id into v_garage_id from garages where owner_user_id = auth.uid(); if v_garage_id is null then raise exception 'Aucun garage associe a cet utilisateur'; end if; insert into garages_secrets (garage_id, stripe_secret_key, updated_at) values (v_garage_id, p_key, now()) on conflict (garage_id) do update set stripe_secret_key = excluded.stripe_secret_key, updated_at = now(); end; $$;


ALTER FUNCTION "public"."set_stripe_secret_key"("p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stripe_configure_pour_mon_garage"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select exists (select 1 from garages_secrets gs join garages g on g.id = gs.garage_id where g.owner_user_id = auth.uid() and gs.stripe_secret_key is not null and gs.stripe_secret_key != ''); $$;


ALTER FUNCTION "public"."stripe_configure_pour_mon_garage"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."actions_ia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid",
    "type" "text",
    "texte" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."actions_ia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom" "text",
    "email" "text",
    "telephone" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demandes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" DEFAULT "gen_random_uuid"(),
    "client_id" "uuid" DEFAULT "gen_random_uuid"(),
    "vehicule_id" "uuid",
    "type_demande" "text",
    "message_original" "text",
    "urgence" "text",
    "statut" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text",
    "canal" "text",
    "source_id" "text",
    "motif" "text",
    "infos_manquantes" "text"[]
);


ALTER TABLE "public"."demandes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."devis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid",
    "demande_id" "uuid",
    "client_id" "uuid",
    "vehicule_id" "uuid",
    "prestation_id" "uuid",
    "montant_ht" numeric,
    "montant_ttc" numeric,
    "statut" "text" DEFAULT 'en_attente'::"text",
    "message_garage" "text",
    "date_validation" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."devis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'google'::"text" NOT NULL,
    "email_address" "text",
    "access_token" "text",
    "refresh_token" "text" NOT NULL,
    "token_expiry" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."erreurs_automatisation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid",
    "workflow_nom" "text",
    "noeud" "text",
    "message" "text",
    "resolu" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."erreurs_automatisation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."factures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid",
    "client_id" "uuid",
    "vehicule_id" "uuid",
    "rendez_vous_id" "uuid",
    "devis_id" "uuid",
    "numero" "text",
    "montant_ht" numeric,
    "montant_ttc" numeric,
    "statut" "text" DEFAULT 'a_payer'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "date_paiement" timestamp with time zone,
    "motif" "text",
    "lignes" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."factures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom_garage" "text" NOT NULL,
    "email" "text",
    "telephone" "text",
    "adresse" "text",
    "modules_actifs" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "owner_user_id" "uuid",
    "horaires" "jsonb",
    "objectif_ca_mensuel" numeric,
    "numero_whatsapp" "text",
    "lien_avis_google" "text",
    "dernier_numero_facture" integer DEFAULT 0 NOT NULL,
    "canaux_notifications" "jsonb" DEFAULT '{"devis": "email", "facture": "email", "vehicule_pret": "email", "confirmation_rdv": "email"}'::"jsonb",
    "theme" "text" DEFAULT 'clair'::"text",
    "automatisation_active" boolean DEFAULT false,
    "gmail_connecte" boolean DEFAULT false,
    "gmail_adresse" "text"
);


ALTER TABLE "public"."garages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garages_secrets" (
    "garage_id" "uuid" NOT NULL,
    "stripe_secret_key" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."garages_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."horaires_garage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" NOT NULL,
    "jour_semaine" integer NOT NULL,
    "heure_ouverture" time without time zone NOT NULL,
    "heure_fermeture" time without time zone NOT NULL,
    "pause_debut" time without time zone,
    "pause_fin" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."horaires_garage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."liste_attente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid",
    "client_id" "uuid",
    "prestation_id" "uuid",
    "statut" "text" DEFAULT 'en_attente'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."liste_attente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mecaniciens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "couleur" "text" DEFAULT '#2a78d6'::"text" NOT NULL,
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mecaniciens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications_atelier" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rendez_vous_id" "uuid",
    "type" "text" DEFAULT 'vehicule_pret'::"text" NOT NULL,
    "envoye" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications_atelier" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications_devis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "devis_id" "uuid",
    "envoye" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" DEFAULT 'nouveau'::"text" NOT NULL
);


ALTER TABLE "public"."notifications_devis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications_factures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "facture_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'nouvelle'::"text" NOT NULL,
    "envoye" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications_factures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications_proposition" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposition_id" "uuid",
    "type" "text" NOT NULL,
    "envoye" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications_proposition" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prestations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "categorie" "text",
    "duree_minutes" integer NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prix_ht" numeric
);


ALTER TABLE "public"."prestations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."propositions_rdv" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" NOT NULL,
    "demande_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "vehicule_id" "uuid",
    "prestation_id" "uuid",
    "date_debut_proposee" timestamp with time zone NOT NULL,
    "date_fin_proposee" timestamp with time zone NOT NULL,
    "statut" "text" DEFAULT 'en_attente'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message_garage" "text",
    "date_validation" timestamp with time zone
);


ALTER TABLE "public"."propositions_rdv" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rendez_vous" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" NOT NULL,
    "demande_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "vehicule_id" "uuid" NOT NULL,
    "prestation_id" "uuid" NOT NULL,
    "date_debut" timestamp with time zone NOT NULL,
    "date_fin" timestamp with time zone NOT NULL,
    "statut" "text" DEFAULT 'en attente'::"text" NOT NULL,
    "source" "text" DEFAULT 'nexora'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "avis_demande" boolean DEFAULT false,
    "mecanicien_id" "uuid",
    "relance_envoyee" boolean DEFAULT false NOT NULL,
    "statut_atelier" "text" DEFAULT 'a_venir'::"text",
    "lien_paiement" "text"
);


ALTER TABLE "public"."rendez_vous" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehicules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" DEFAULT "gen_random_uuid"(),
    "client_id" "uuid" DEFAULT "gen_random_uuid"(),
    "marque" "text",
    "modele" "text",
    "annee" integer,
    "immatriculation" "text",
    "kilometrage" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vehicules" OWNER TO "postgres";


ALTER TABLE ONLY "public"."garages"
    ADD CONSTRAINT "Garages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actions_ia"
    ADD CONSTRAINT "actions_ia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demandes"
    ADD CONSTRAINT "demandes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_connections"
    ADD CONSTRAINT "email_connections_garage_id_key" UNIQUE ("garage_id");



ALTER TABLE ONLY "public"."email_connections"
    ADD CONSTRAINT "email_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."erreurs_automatisation"
    ADD CONSTRAINT "erreurs_automatisation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garages_secrets"
    ADD CONSTRAINT "garages_secrets_pkey" PRIMARY KEY ("garage_id");



ALTER TABLE ONLY "public"."horaires_garage"
    ADD CONSTRAINT "horaires_garages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."liste_attente"
    ADD CONSTRAINT "liste_attente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mecaniciens"
    ADD CONSTRAINT "mecaniciens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications_atelier"
    ADD CONSTRAINT "notifications_atelier_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications_devis"
    ADD CONSTRAINT "notifications_devis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications_factures"
    ADD CONSTRAINT "notifications_factures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications_proposition"
    ADD CONSTRAINT "notifications_proposition_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prestations"
    ADD CONSTRAINT "prestations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."propositions_rdv"
    ADD CONSTRAINT "propositions_rdv_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rendez_vous"
    ADD CONSTRAINT "rendez_vous_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vehicules"
    ADD CONSTRAINT "vehicules_immatriculation_unique" UNIQUE ("immatriculation");



ALTER TABLE ONLY "public"."vehicules"
    ADD CONSTRAINT "vehicules_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "garages_owner_user_id_uniq" ON "public"."garages" USING "btree" ("owner_user_id");



CREATE OR REPLACE TRIGGER "trg_assigner_numero_facture" BEFORE INSERT ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."assigner_numero_facture"();



CREATE OR REPLACE TRIGGER "trg_notifier_devis_maj" AFTER UPDATE ON "public"."devis" FOR EACH ROW EXECUTE FUNCTION "public"."notifier_devis_maj"();



CREATE OR REPLACE TRIGGER "trg_notifier_facture_payee" AFTER UPDATE ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."notifier_facture_payee"();



CREATE OR REPLACE TRIGGER "trg_notifier_nouveau_devis" AFTER INSERT ON "public"."devis" FOR EACH ROW EXECUTE FUNCTION "public"."notifier_nouveau_devis"();



CREATE OR REPLACE TRIGGER "trg_notifier_nouvelle_facture" AFTER INSERT ON "public"."factures" FOR EACH ROW EXECUTE FUNCTION "public"."notifier_nouvelle_facture"();



CREATE OR REPLACE TRIGGER "trg_notifier_proposition_maj" AFTER UPDATE ON "public"."propositions_rdv" FOR EACH ROW EXECUTE FUNCTION "public"."notifier_proposition_maj"();



CREATE OR REPLACE TRIGGER "trg_notifier_vehicule_pret" AFTER UPDATE OF "statut_atelier" ON "public"."rendez_vous" FOR EACH ROW EXECUTE FUNCTION "public"."notifier_vehicule_pret"();



ALTER TABLE ONLY "public"."actions_ia"
    ADD CONSTRAINT "actions_ia_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



ALTER TABLE ONLY "public"."demandes"
    ADD CONSTRAINT "demandes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."demandes"
    ADD CONSTRAINT "demandes_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



ALTER TABLE ONLY "public"."demandes"
    ADD CONSTRAINT "demandes_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id");



ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes"("id");



ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "public"."prestations"("id");



ALTER TABLE ONLY "public"."devis"
    ADD CONSTRAINT "devis_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id");



ALTER TABLE ONLY "public"."email_connections"
    ADD CONSTRAINT "email_connections_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."erreurs_automatisation"
    ADD CONSTRAINT "erreurs_automatisation_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "public"."devis"("id");



ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "public"."rendez_vous"("id");



ALTER TABLE ONLY "public"."factures"
    ADD CONSTRAINT "factures_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id");



ALTER TABLE ONLY "public"."garages"
    ADD CONSTRAINT "garages_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."garages_secrets"
    ADD CONSTRAINT "garages_secrets_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."liste_attente"
    ADD CONSTRAINT "liste_attente_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."liste_attente"
    ADD CONSTRAINT "liste_attente_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



ALTER TABLE ONLY "public"."liste_attente"
    ADD CONSTRAINT "liste_attente_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "public"."prestations"("id");



ALTER TABLE ONLY "public"."mecaniciens"
    ADD CONSTRAINT "mecaniciens_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications_atelier"
    ADD CONSTRAINT "notifications_atelier_rendez_vous_id_fkey" FOREIGN KEY ("rendez_vous_id") REFERENCES "public"."rendez_vous"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications_devis"
    ADD CONSTRAINT "notifications_devis_devis_id_fkey" FOREIGN KEY ("devis_id") REFERENCES "public"."devis"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications_factures"
    ADD CONSTRAINT "notifications_factures_facture_id_fkey" FOREIGN KEY ("facture_id") REFERENCES "public"."factures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications_proposition"
    ADD CONSTRAINT "notifications_proposition_proposition_id_fkey" FOREIGN KEY ("proposition_id") REFERENCES "public"."propositions_rdv"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."propositions_rdv"
    ADD CONSTRAINT "propositions_rdv_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."propositions_rdv"
    ADD CONSTRAINT "propositions_rdv_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "public"."demandes"("id");



ALTER TABLE ONLY "public"."propositions_rdv"
    ADD CONSTRAINT "propositions_rdv_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "public"."prestations"("id");



ALTER TABLE ONLY "public"."propositions_rdv"
    ADD CONSTRAINT "propositions_rdv_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id");



ALTER TABLE ONLY "public"."rendez_vous"
    ADD CONSTRAINT "rendez_vous_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."rendez_vous"
    ADD CONSTRAINT "rendez_vous_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



ALTER TABLE ONLY "public"."rendez_vous"
    ADD CONSTRAINT "rendez_vous_mecanicien_id_fkey" FOREIGN KEY ("mecanicien_id") REFERENCES "public"."mecaniciens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rendez_vous"
    ADD CONSTRAINT "rendez_vous_prestation_id_fkey" FOREIGN KEY ("prestation_id") REFERENCES "public"."prestations"("id");



ALTER TABLE ONLY "public"."rendez_vous"
    ADD CONSTRAINT "rendez_vous_vehicule_id_fkey" FOREIGN KEY ("vehicule_id") REFERENCES "public"."vehicules"("id");



ALTER TABLE ONLY "public"."vehicules"
    ADD CONSTRAINT "vehicules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."vehicules"
    ADD CONSTRAINT "vehicules_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");



CREATE POLICY "Lecture erreurs du garage proprietaire" ON "public"."erreurs_automatisation" FOR SELECT TO "authenticated" USING (("garage_id" IN ( SELECT "garages"."id"
   FROM "public"."garages"
  WHERE ("garages"."owner_user_id" = "auth"."uid"()))));



ALTER TABLE "public"."actions_ia" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "actions_ia_scope" ON "public"."actions_ia" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_scope" ON "public"."clients" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."demandes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "demandes_scope" ON "public"."demandes" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."devis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "devis_scope" ON "public"."devis" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."email_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."erreurs_automatisation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."factures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "factures_scope" ON "public"."factures" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."garages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."garages_secrets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "garages_self_select" ON "public"."garages" FOR SELECT USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "garages_self_update" ON "public"."garages" FOR UPDATE USING (("owner_user_id" = "auth"."uid"()));



ALTER TABLE "public"."horaires_garage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."liste_attente" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "liste_attente_scope" ON "public"."liste_attente" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."mecaniciens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mecaniciens_delete" ON "public"."mecaniciens" FOR DELETE TO "authenticated" USING (("garage_id" = "public"."current_garage_id"()));



CREATE POLICY "mecaniciens_insert" ON "public"."mecaniciens" FOR INSERT TO "authenticated" WITH CHECK (("garage_id" = "public"."current_garage_id"()));



CREATE POLICY "mecaniciens_select" ON "public"."mecaniciens" FOR SELECT TO "authenticated" USING (("garage_id" = "public"."current_garage_id"()));



CREATE POLICY "mecaniciens_update" ON "public"."mecaniciens" FOR UPDATE TO "authenticated" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



CREATE POLICY "n8n_insert_propositions_rdv" ON "public"."propositions_rdv" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "n8n_read_clients" ON "public"."clients" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "n8n_read_horaires_garage" ON "public"."horaires_garage" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "n8n_read_prestations" ON "public"."prestations" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "n8n_read_propositions_rdv" ON "public"."propositions_rdv" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "n8n_read_rendez_vous" ON "public"."rendez_vous" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "n8n_update_propositions_rdv" ON "public"."propositions_rdv" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "n8n_write_rendez_vous" ON "public"."rendez_vous" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."notifications_atelier" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_atelier_scope" ON "public"."notifications_atelier" TO "authenticated" USING (("rendez_vous_id" IN ( SELECT "rendez_vous"."id"
   FROM "public"."rendez_vous"
  WHERE ("rendez_vous"."garage_id" = "public"."current_garage_id"())))) WITH CHECK (("rendez_vous_id" IN ( SELECT "rendez_vous"."id"
   FROM "public"."rendez_vous"
  WHERE ("rendez_vous"."garage_id" = "public"."current_garage_id"()))));



ALTER TABLE "public"."notifications_devis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications_factures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications_proposition" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prestations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prestations_scope" ON "public"."prestations" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."propositions_rdv" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "propositions_rdv_scope" ON "public"."propositions_rdv" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."rendez_vous" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rendez_vous_scope" ON "public"."rendez_vous" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



ALTER TABLE "public"."vehicules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vehicules_scope" ON "public"."vehicules" USING (("garage_id" = "public"."current_garage_id"())) WITH CHECK (("garage_id" = "public"."current_garage_id"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."avancer_etape_atelier"("rdv_id" "uuid", "nouveau_statut" "text") TO "anon";



GRANT ALL ON FUNCTION "public"."lire_devis_public"("p_devis_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."lire_devis_public"("p_devis_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."lire_etape_atelier"("rdv_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."lire_facture_publique"("p_facture_id" "uuid") TO "anon";



GRANT ALL ON FUNCTION "public"."notifications_vehicule_pret_en_attente"() TO "service_role";
GRANT ALL ON FUNCTION "public"."notifications_vehicule_pret_en_attente"() TO "anon";
GRANT ALL ON FUNCTION "public"."notifications_vehicule_pret_en_attente"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."repondre_devis_public"("p_devis_id" "uuid", "p_reponse" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."repondre_devis_public"("p_devis_id" "uuid", "p_reponse" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."set_stripe_secret_key"("p_key" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."stripe_configure_pour_mon_garage"() TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."actions_ia" TO "anon";
GRANT ALL ON TABLE "public"."actions_ia" TO "authenticated";
GRANT ALL ON TABLE "public"."actions_ia" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."demandes" TO "anon";
GRANT ALL ON TABLE "public"."demandes" TO "authenticated";
GRANT ALL ON TABLE "public"."demandes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."devis" TO "anon";
GRANT ALL ON TABLE "public"."devis" TO "authenticated";
GRANT ALL ON TABLE "public"."devis" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."email_connections" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."email_connections" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."email_connections" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."erreurs_automatisation" TO "anon";
GRANT ALL ON TABLE "public"."erreurs_automatisation" TO "authenticated";
GRANT ALL ON TABLE "public"."erreurs_automatisation" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."factures" TO "anon";
GRANT ALL ON TABLE "public"."factures" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."factures" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."garages" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."garages" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."garages" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."garages_secrets" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."garages_secrets" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."garages_secrets" TO "service_role";



GRANT SELECT ON TABLE "public"."horaires_garage" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."liste_attente" TO "anon";
GRANT ALL ON TABLE "public"."liste_attente" TO "authenticated";
GRANT ALL ON TABLE "public"."liste_attente" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."mecaniciens" TO "anon";
GRANT ALL ON TABLE "public"."mecaniciens" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."mecaniciens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications_atelier" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications_atelier" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notifications_atelier" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications_devis" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications_devis" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notifications_devis" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications_factures" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications_factures" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notifications_factures" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications_proposition" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notifications_proposition" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."notifications_proposition" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."prestations" TO "service_role";
GRANT SELECT ON TABLE "public"."prestations" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."prestations" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."propositions_rdv" TO "anon";
GRANT ALL ON TABLE "public"."propositions_rdv" TO "authenticated";
GRANT ALL ON TABLE "public"."propositions_rdv" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."rendez_vous" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."rendez_vous" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."rendez_vous" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vehicules" TO "anon";
GRANT ALL ON TABLE "public"."vehicules" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicules" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";

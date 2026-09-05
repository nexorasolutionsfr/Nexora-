-- Facturation électronique — étape 1 : les données manquantes.
-- Référence : docs/architecture/facture-electronique-v1.md
--
-- POURQUOI MAINTENANT
--
-- La réforme française de la facturation électronique impose depuis le
-- 1er septembre 2026 que toute entreprise sache RECEVOIR une facture
-- électronique — micro-entreprises et franchisés en base de TVA compris. Les
-- TPE, PME et micro-entreprises devront ÉMETTRE au 1er septembre 2027 : c'est
-- l'échéance de tous les garages clients de Nexora.
--
-- Quatre mentions deviennent obligatoires sur la facture :
--   1. le SIREN du client ;
--   2. l'adresse de livraison, si elle diffère de l'adresse de facturation ;
--   3. la nature de l'opération (livraison de biens, prestation de services,
--      ou les deux) ;
--   4. l'option pour le paiement de la TVA d'après les débits, le cas échéant.
--
-- Trois d'entre elles sont absentes du modèle actuel. Sans ces colonnes, aucune
-- facture émise par Nexora ne pourra être conforme, quelle que soit la
-- plateforme agréée retenue plus tard. Ce lot est donc le préalable commun à
-- tous les scénarios de raccordement.
--
-- CE LOT NE FAIT QUE LE MODÈLE
--
-- Ni génération de Factur-X, ni raccordement à une plateforme. Rien ici ne
-- change le comportement de l'application : toutes les colonnes sont
-- nullables ou pourvues d'une valeur par défaut, et aucune facture existante
-- n'est modifiée.

-- =====================================================================
-- 1. Validité d'un SIREN — règle unique
-- =====================================================================
-- Neuf chiffres et une clé de Luhn. Vérifier le format au moment de la saisie
-- vaut mieux que de découvrir le rejet à l'autre bout de la chaîne : une
-- facture refusée par la plateforme revient au garage sans qu'il comprenne
-- pourquoi, et l'amende de 15 € par mention inexacte est déjà tombée.
--
-- Fermé par défaut : NULL et toute chaîne mal formée renvoient faux. La
-- contrainte de table n'applique donc la règle qu'aux valeurs renseignées.

create function public.siren_valide(p_siren text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_somme int := 0;
  v_chiffre int;
  i int;
begin
  if p_siren is null or p_siren !~ '^[0-9]{9}$' then
    return false;
  end if;

  -- Luhn : en partant de la droite, un chiffre sur deux est doublé.
  for i in 1..9 loop
    v_chiffre := substr(p_siren, i, 1)::int;
    if (9 - i) % 2 = 1 then
      v_chiffre := v_chiffre * 2;
      if v_chiffre > 9 then
        v_chiffre := v_chiffre - 9;
      end if;
    end if;
    v_somme := v_somme + v_chiffre;
  end loop;

  return v_somme % 10 = 0;
end;
$$;

comment on function public.siren_valide(text) is
  'Vrai si la chaîne est un SIREN recevable : neuf chiffres et clé de Luhn correcte. Fermé par défaut — NULL et tout format inattendu renvoient faux. Source unique de la règle.';

revoke execute on function public.siren_valide(text) from public;
revoke execute on function public.siren_valide(text) from anon;
revoke execute on function public.siren_valide(text) from service_role;
grant execute on function public.siren_valide(text) to authenticated;

-- =====================================================================
-- 2. L'émetteur : le garage
-- =====================================================================

alter table public.garages add column siren text;
alter table public.garages add constraint garages_siren_valide
  check (siren is null or public.siren_valide(siren));

alter table public.garages add column tva_sur_les_debits boolean not null default false;

comment on column public.garages.siren is
  'SIREN du garage, neuf chiffres. Obligatoire sur toute facture émise ; NULL tant que le garage ne l''a pas renseigné.';
comment on column public.garages.tva_sur_les_debits is
  'Le garage a opté pour le paiement de la TVA d''après les débits. Quatrième mention obligatoire de la réforme, à porter sur la facture lorsqu''elle est vraie.';

-- =====================================================================
-- 3. Le destinataire : le client
-- =====================================================================
-- Le SIREN du client n'est obligatoire QUE pour les factures entre
-- professionnels. Un particulier n'en a pas, et ses factures relèvent de
-- l'e-reporting et non du circuit entre plateformes. Confondre les deux
-- conduirait à réclamer au garage un numéro qui n'existe pas, sur la moitié de
-- ses clients — d'où le drapeau explicite plutôt qu'une déduction.

alter table public.clients add column est_professionnel boolean not null default false;
alter table public.clients add column siren text;
alter table public.clients add constraint clients_siren_valide
  check (siren is null or public.siren_valide(siren));

-- Un particulier ne peut pas porter de SIREN : l'incohérence est refusée à
-- l'écriture plutôt que découverte à l'émission.
alter table public.clients add constraint clients_siren_reserve_aux_pros
  check (siren is null or est_professionnel);

comment on column public.clients.est_professionnel is
  'Le client est une entreprise. Détermine si la facture relève du circuit entre plateformes (B2B) ou de l''e-reporting (particulier). Faux par défaut : la clientèle d''un garage est majoritairement composée de particuliers.';
comment on column public.clients.siren is
  'SIREN du client professionnel, neuf chiffres. Mention obligatoire sur les factures entre professionnels. Interdit sur un particulier.';

-- =====================================================================
-- 4. La facture
-- =====================================================================

alter table public.factures add column adresse_livraison text;
alter table public.factures add column categorie_operation text;
alter table public.factures add constraint factures_categorie_operation_valide
  check (categorie_operation is null or categorie_operation in ('biens', 'services', 'mixte'));

comment on column public.factures.adresse_livraison is
  'Lieu de livraison lorsqu''il diffère de l''adresse de facturation. NULL signifie « identique à l''adresse de facturation », ce qui est le cas courant d''un véhicule réparé et restitué sur place.';
comment on column public.factures.categorie_operation is
  'Nature de l''opération : biens, services, ou mixte. Se déduit des lignes — une pièce est une livraison de biens, une main-d''oeuvre une prestation de services — mais est figée sur la facture, car une facture est immuable et ses lignes peuvent être recalculées.';

-- =====================================================================
-- 5. Vérification dans la transaction de la migration
-- =====================================================================

do $$
declare
  v_pb text := '';
begin
  -- 5.1 La règle de Luhn est juste. Trois SIREN réels et connus, plus des
  -- rejets attendus. Une règle de validation fausse est pire que pas de
  -- validation : elle refuse des saisies correctes.
  if not public.siren_valide('552100554') then   -- Renault
    v_pb := v_pb || 'un SIREN valide est refuse (552100554); ';
  end if;
  if not public.siren_valide('542051180') then   -- Total
    v_pb := v_pb || 'un SIREN valide est refuse (542051180); ';
  end if;
  if not public.siren_valide('108995788') then   -- l'editeur
    v_pb := v_pb || 'un SIREN valide est refuse (108995788); ';
  end if;
  if public.siren_valide('552100555') then
    v_pb := v_pb || 'une cle de Luhn fausse est acceptee; ';
  end if;
  if public.siren_valide('12345678') or public.siren_valide('1234567890') then
    v_pb := v_pb || 'une longueur incorrecte est acceptee; ';
  end if;
  if public.siren_valide('55210055A') or public.siren_valide('552 100 554') then
    v_pb := v_pb || 'un format non numerique est accepte; ';
  end if;
  if public.siren_valide(null) then
    v_pb := v_pb || 'NULL est accepte; ';
  end if;

  -- 5.2 Les colonnes existent.
  if (select count(*) from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (
          ('garages', 'siren'), ('garages', 'tva_sur_les_debits'),
          ('clients', 'siren'), ('clients', 'est_professionnel'),
          ('factures', 'adresse_livraison'), ('factures', 'categorie_operation')
        )) <> 6 then
    v_pb := v_pb || 'une des six colonnes est absente; ';
  end if;

  -- 5.3 Aucune donnée existante n'est mise en défaut. Cette migration part
  -- directement en production : elle ne doit pas rendre invalide une ligne
  -- déjà enregistrée.
  if exists (select 1 from public.garages where siren is not null and not public.siren_valide(siren)) then
    v_pb := v_pb || 'un garage existant porte un SIREN invalide; ';
  end if;
  if exists (select 1 from public.clients where siren is not null) then
    v_pb := v_pb || 'un client existant porte deja un SIREN, cas non prevu; ';
  end if;

  -- 5.4 Droits de la règle.
  if has_function_privilege('anon', 'public.siren_valide(text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.siren_valide(text)', 'EXECUTE') then
    v_pb := v_pb || 'siren_valide ouverte a anon ou service_role; ';
  end if;
  if not has_function_privilege('authenticated', 'public.siren_valide(text)', 'EXECUTE') then
    v_pb := v_pb || 'authenticated ne peut pas valider un SIREN; ';
  end if;

  if v_pb <> '' then
    raise exception 'lot facture electronique modele v1: %', v_pb;
  end if;
end;
$$;

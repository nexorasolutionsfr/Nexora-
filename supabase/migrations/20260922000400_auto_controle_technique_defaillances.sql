-- Nexora Auto — correction du contrôle technique : défaillances et contre-visite.
--
-- Revue du 16 septembre 2026, vérifiée sur service-public.fr (F2878) :
--
-- a. Un résultat défavorable n'a pas une seule conséquence :
--    - défaillance majeure : contrôle valable 2 mois ;
--    - défaillance critique : validité limitée au jour du contrôle ;
--    dans les deux cas, contre-visite au plus tard 2 mois après.
--    `resultat_controle` distingue donc favorable, defavorable_majeure et
--    defavorable_critique.
-- b. Une contre-visite favorable vaut 2 ans à compter du contrôle périodique
--    défavorable qui l'a motivée : il faut savoir qu'une ligne est une
--    contre-visite. `nature_controle` : periodique ou contre_visite.
-- c. Défaillance critique : la date de validité peut être le jour même du
--    contrôle ; la contrainte passe de « après » à « pas avant ».
--
-- L'ancienne valeur `contre_visite` (20260922000200) ne disait pas si la
-- défaillance était majeure ou critique : elle devient « non précisé » (NULL),
-- plutôt qu'une valeur supposée. Relevé du 16 septembre : aucune ligne sur
-- Test ne la porte.
--
-- Retour arrière : supprimer `nature_controle` et les contraintes, recréer
-- celles de 20260922000200.

alter table public.auto_historique add column if not exists nature_controle text;

alter table public.auto_historique drop constraint if exists auto_historique_resultat_controle_valide;
update public.auto_historique set resultat_controle = null where resultat_controle = 'contre_visite';
alter table public.auto_historique add constraint auto_historique_resultat_controle_valide
  check (resultat_controle is null or resultat_controle in ('favorable', 'defavorable_majeure', 'defavorable_critique'));

alter table public.auto_historique drop constraint if exists auto_historique_nature_controle_valide;
alter table public.auto_historique add constraint auto_historique_nature_controle_valide
  check (nature_controle is null or nature_controle in ('periodique', 'contre_visite'));

alter table public.auto_historique drop constraint if exists auto_historique_controle_seulement;
alter table public.auto_historique add constraint auto_historique_controle_seulement
  check (
    type = 'controle_technique'
    or (resultat_controle is null and controle_valable_jusqu_au is null and nature_controle is null)
  );

alter table public.auto_historique drop constraint if exists auto_historique_validite_apres_controle;
alter table public.auto_historique add constraint auto_historique_validite_apres_controle
  check (controle_valable_jusqu_au is null or controle_valable_jusqu_au >= realise_le);

comment on column public.auto_historique.resultat_controle is
  'Contrôle technique seulement : favorable, defavorable_majeure (valable 2 mois) ou defavorable_critique (validité limitée au jour même). NULL = non précisé.';
comment on column public.auto_historique.nature_controle is
  'Contrôle technique seulement : periodique ou contre_visite. NULL = periodique non précisé. Une contre-visite favorable vaut 2 ans à compter du contrôle initial.';

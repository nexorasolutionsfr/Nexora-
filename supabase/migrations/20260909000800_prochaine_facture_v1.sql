-- Quand le garage sera-t-il prélevé, et de combien.
--
-- CE QUI MANQUAIT, ET POURQUOI ÇA COMPTE
--
-- Au moment où un garage s'abonne, `acces_motif` passe à `abonnement` et
-- `acces_fin` est mise à NULL — l'accès n'a plus de fin, c'est exact. Mais on
-- perdait au passage la seule information qu'il voulait garder sous les yeux :
-- **la date du premier prélèvement**.
--
-- Un abonnement avec période d'essai se déclenche tout seul à l'échéance.
-- C'est le comportement voulu, et c'est aussi celui qui produit les litiges
-- quand personne n'a prévenu. Le porteur du projet l'a formulé en une phrase
-- après avoir testé lui-même : « il faut leur dire que c'est annulable avant
-- le prélèvement, et qu'on les prévient quelques jours avant ».
--
-- On ne peut pas prévenir de ce qu'on ne sait pas. D'où cette colonne.
--
-- POURQUOI PAS UN E-MAIL
--
-- Pas encore. L'expéditeur Resend actuellement configuré
-- (`onboarding@resend.dev`) n'a le droit d'écrire qu'au titulaire du compte :
-- un rappel adressé à un garage serait refusé. Tant qu'il n'y a pas de domaine
-- vérifié, le rappel vit **dans l'application**, où le garage passe tous les
-- jours — et Stripe envoie le sien de son côté.

begin;

alter table public.garages
  add column if not exists abonnement_prochaine_facture timestamptz;

comment on column public.garages.abonnement_prochaine_facture is
  'Date du prochain prélèvement Stripe. Pendant l''essai, c''est la fin de l''essai — donc la date du PREMIER prélèvement. Écrite par le webhook.';

-- Cette colonne décrit un prélèvement : elle n'appartient pas au garage, elle
-- appartient à Stripe. Même règle que 20260909000600 et 20260909000700 — la
-- liste blanche de `authenticated` ne bouge pas, donc la colonne neuve n'y est
-- pas et reste hors de sa portée.

do $$
declare
  fuite text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'garages'
      and column_name = 'abonnement_prochaine_facture'
  ) then
    raise exception 'La colonne abonnement_prochaine_facture n''existe pas apres migration';
  end if;

  select string_agg(c.nom, ', ' order by c.nom) into fuite
  from (values ('abonnement_prochaine_facture'), ('acces_motif'), ('acces_fin'),
               ('abonnement_actif'), ('forfait')) as c(nom)
  where has_column_privilege('authenticated', 'public.garages', c.nom, 'UPDATE');
  if fuite is not null then
    raise exception 'authenticated peut ecrire des colonnes d''abonnement : %', fuite;
  end if;

  if not has_column_privilege('service_role', 'public.garages', 'abonnement_prochaine_facture', 'UPDATE') then
    raise exception 'service_role ne peut pas ecrire la date de prochaine facture : le webhook serait muet';
  end if;

  -- Le garage doit pouvoir LIRE sa propre date de prélèvement, sinon le
  -- bandeau qui l'annonce n'a rien à afficher.
  if not has_column_privilege('authenticated', 'public.garages', 'abonnement_prochaine_facture', 'SELECT') then
    raise exception 'authenticated ne peut pas lire sa date de prelevement';
  end if;
end $$;

commit;

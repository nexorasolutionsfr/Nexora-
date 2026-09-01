-- Revenue Recovery V1 — correctif : écriture des permissions par RPC
-- sécurisée, plus par INSERT direct.
-- Migration additive, non destructive (ne touche aucune ligne existante :
-- la table est vide à ce stade).
--
-- Contradiction corrigée : un GRANT insert direct à `authenticated` sur
-- revenue_recovery_permissions laissait n'importe quel client applicatif
-- fabriquer librement une ligne "autorise" — y compris juste après une
-- "oppose" — avec un simple texte libre en guise de preuve, sans aucune
-- vérification de fraîcheur ni de cohérence. "L'événement le plus récent
-- gagne" décrivait la lecture (la vue dérivée), pas une garantie d'écriture.
--
-- Choix retenu : révoquer l'INSERT direct, forcer tout enregistrement par
-- cette fonction SECURITY DEFINER, qui impose une machine à états.
--
-- Machine à états imposée (état courant -> statuts cible acceptés) :
--   (aucune ligne) / inconnu -> inconnu, autorise (justifié), oppose
--   autorise                -> autorise (renouvellement), oppose, expire, revoque
--   oppose / expire / revoque -> lui-même (idempotent), oppose,
--                                 autorise UNIQUEMENT avec une preuve non
--                                 vide et DISTINCTE de la dernière preuve connue
--   * -> inconnu : refusé sauf depuis (aucune ligne)/inconnu — on ne revient
--        jamais à "inconnu" pour effacer une décision plus engageante.
-- Ceci reste une garde applicative, pas un avis juridique : la définition
-- exacte d'une "preuve nouvelle et compatible" devra être confirmée avec un
-- juriste avant tout envoi réel (voir dossier de décision).

create or replace function public.revenue_recovery_enregistrer_permission(
  p_garage_id uuid,
  p_client_id uuid,
  p_canal text,
  p_statut text,
  p_origine text,
  p_travail_differe_id uuid default null,
  p_base_eligibilite text default null,
  p_preuve_reference text default null,
  p_motif text default null
)
returns public.revenue_recovery_permissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.revenue_recovery_permissions;
  v_actuel record;
  v_derniere_autorisation record;
begin
  if p_canal <> 'email' then
    raise exception 'Canal non supporté : %', p_canal;
  end if;
  if p_statut not in ('inconnu', 'autorise', 'oppose', 'expire', 'revoque') then
    raise exception 'Statut invalide : %', p_statut;
  end if;
  if p_origine is null or length(trim(p_origine)) = 0 then
    raise exception 'origine est obligatoire';
  end if;

  -- SECURITY DEFINER contourne le RLS : toutes les vérifications
  -- d'appartenance doivent être refaites explicitement ici. Aucune écriture
  -- inter-garages possible : le garage_id est vérifié contre auth.uid(),
  -- le client_id et le travail_differe_id sont vérifiés contre ce même
  -- garage_id, jamais l'inverse.
  if not exists (
    select 1 from public.garages where id = p_garage_id and owner_user_id = auth.uid()
  ) then
    raise exception 'Accès refusé au garage %', p_garage_id;
  end if;

  if not exists (
    select 1 from public.clients where id = p_client_id and garage_id = p_garage_id
  ) then
    raise exception 'Client % n''appartient pas au garage %', p_client_id, p_garage_id;
  end if;

  if p_travail_differe_id is not null and not exists (
    select 1 from public.travaux_differes where id = p_travail_differe_id and garage_id = p_garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', p_travail_differe_id, p_garage_id;
  end if;

  -- Verrou consultatif par (garage, client, canal) : sérialise les appels
  -- concurrents sur la même paire client/canal pour la durée de la
  -- transaction, afin que la lecture de l'état courant ci-dessous et
  -- l'insertion qui suit forment un bloc atomique — sans quoi deux appels
  -- simultanés pourraient tous deux lire "oppose" et tous deux réussir à
  -- passer en "autorise" avec des preuves différentes mais valides chacune
  -- prise isolément.
  perform pg_advisory_xact_lock(
    hashtextextended(p_garage_id::text || ':' || p_client_id::text || ':' || p_canal, 0)
  );

  -- État courant : uniquement le statut. Son preuve_reference n'est PAS
  -- fiable pour la comparaison ci-dessous — une ligne "oppose" n'a jamais
  -- de preuve (elle n'en exige aucune), donc comparer contre elle rendait
  -- la garde de fraîcheur totalement inopérante (bug corrigé ici : voir
  -- v_derniere_autorisation plus bas).
  select statut into v_actuel
  from public.revenue_recovery_permissions_courant
  where garage_id = p_garage_id and client_id = p_client_id and canal = p_canal;

  if v_actuel.statut is null then
    v_actuel.statut := 'inconnu';
  end if;

  if p_statut = 'inconnu' and v_actuel.statut <> 'inconnu' then
    raise exception 'Transition refusée : impossible de revenir à "inconnu" depuis "%"', v_actuel.statut;
  end if;

  if p_statut = 'autorise' then
    if p_base_eligibilite is null or length(trim(p_base_eligibilite)) = 0
       or p_preuve_reference is null or length(trim(p_preuve_reference)) = 0 then
      raise exception 'Transition refusée : "autorise" exige base_eligibilite et preuve_reference';
    end if;

    if v_actuel.statut in ('oppose', 'expire', 'revoque') then
      -- Comparaison contre la DERNIÈRE ligne "autorise" réelle (jamais
      -- contre la ligne "oppose"/"expire"/"revoque" courante, dont la
      -- preuve est structurellement absente). Ordre totalement
      -- déterministe (created_at desc, id desc) pour départager deux
      -- lignes au même horodatage.
      select preuve_reference into v_derniere_autorisation
      from public.revenue_recovery_permissions
      where garage_id = p_garage_id and client_id = p_client_id and canal = p_canal
        and statut = 'autorise'
      order by created_at desc, id desc
      limit 1;

      -- Si aucune autorisation n'a jamais existé (le client s'est opposé
      -- avant d'avoir jamais été autorisé), il n'y a rien à comparer :
      -- toute preuve non vide déjà validée ci-dessus suffit. Sinon, la
      -- nouvelle preuve doit être non vide ET différente de la dernière
      -- preuve d'autorisation connue.
      if v_derniere_autorisation.preuve_reference is not null
         and p_preuve_reference is not distinct from v_derniere_autorisation.preuve_reference then
        raise exception 'Transition refusée : une nouvelle autorisation après "%" exige une preuve distincte de la dernière autorisation (pas de la ligne d''opposition, qui n''en porte pas)', v_actuel.statut;
      end if;
    end if;
  end if;

  insert into public.revenue_recovery_permissions
    (garage_id, client_id, travail_differe_id, canal, statut, base_eligibilite, origine, preuve_reference, motif)
  values
    (p_garage_id, p_client_id, p_travail_differe_id, p_canal, p_statut, p_base_eligibilite, p_origine, p_preuve_reference, p_motif)
  returning * into v_row;
  -- enregistre_par/created_at restent forcés par le trigger existant sur la
  -- table (revenue_recovery_permissions_avant_insert), qui s'exécute aussi
  -- pour un INSERT émis depuis une fonction SECURITY DEFINER.

  return v_row;
end;
$$;

-- Ce projet Supabase accorde EXECUTE par défaut à anon, authenticated ET
-- service_role au moment de la création d'une fonction dans le schéma
-- public (privilèges par défaut configurés au niveau du schéma) — pas
-- seulement à PUBLIC. Chaque rôle doit donc être révoqué explicitement,
-- avant tout nouveau GRANT, plutôt que de compter sur `revoke ... from
-- public` seul (insuffisant, démontré sur le projet de test isolé).
revoke all on function public.revenue_recovery_enregistrer_permission(uuid, uuid, text, text, text, uuid, text, text, text) from public;
revoke all on function public.revenue_recovery_enregistrer_permission(uuid, uuid, text, text, text, uuid, text, text, text) from anon;
revoke all on function public.revenue_recovery_enregistrer_permission(uuid, uuid, text, text, text, uuid, text, text, text) from authenticated;
revoke all on function public.revenue_recovery_enregistrer_permission(uuid, uuid, text, text, text, uuid, text, text, text) from service_role;
-- Seul authenticated est ré-accordé : c'est le garage lui-même qui
-- enregistre ses propres décisions de permission (pas anon — jamais avant
-- authentification ; pas service_role — aucun processus serveur n'en a
-- besoin aujourd'hui). Le contrôle interne est complet : propriété du
-- garage vérifiée via auth.uid(), client/travail différé scopés au même
-- garage, machine à états imposée, preuve comparée à la dernière
-- autorisation réelle (corrigé ci-dessus), verrou consultatif contre les
-- appels concurrents.
grant execute on function public.revenue_recovery_enregistrer_permission(uuid, uuid, text, text, text, uuid, text, text, text) to authenticated;

comment on function public.revenue_recovery_enregistrer_permission(uuid, uuid, text, text, text, uuid, text, text, text) is
  'Seul point d''écriture autorisé sur revenue_recovery_permissions. Impose la machine à états (l''opposition ne peut être levée que par une preuve nouvelle et distincte de la dernière autorisation réelle, jamais de la ligne d''opposition) et interdit toute écriture inter-garages. Fermée à anon et service_role explicitement.';

-- INSERT direct désormais fermé à authenticated : toute écriture doit
-- passer par la fonction ci-dessus. SELECT reste ouvert (déjà accordé en
-- 20260831000200) pour permettre la lecture du journal complet, pas
-- seulement de l'état courant.
revoke insert on public.revenue_recovery_permissions from authenticated;

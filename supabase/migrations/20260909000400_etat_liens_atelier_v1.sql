-- Connaître les liens atelier actifs, sans jamais exposer de jeton.
-- Référence : docs/architecture/liens-atelier-visibles-v1.md
--
-- LE DÉFAUT QUE CE LOT FERME
--
-- `creer_jeton_atelier` révoque le lien actif du rendez-vous avant d'en créer
-- un nouveau : un seul lien valide à la fois, ce qui est la bonne règle. Le
-- jeton en clair n'est renvoyé qu'une fois et n'est jamais stocké — seule son
-- empreinte SHA-256 l'est, ce qui est également la bonne règle.
--
-- Mais `atelier_jetons` n'a ni policy ni privilège pour `authenticated` : le
-- tableau de bord ne peut donc PAS savoir quels rendez-vous ont déjà un lien.
-- Son état local part vide à chaque rechargement de page.
--
-- Résultat, dans l'atelier réel : le garage imprime ses étiquettes le matin et
-- les colle sur les pare-brise. Il recharge sa page dans la journée — une
-- voiture de plus arrive, un onglet rouvert, n'importe quoi. Il réimprime. La
-- fonction, ne voyant aucun lien dans son état vide, en régénère pour TOUS les
-- rendez-vous du jour, et **révoque au passage tous les QR déjà collés**. Les
-- clients scannent et tombent sur une erreur, sans que personne au garage ne
-- comprenne pourquoi.
--
-- CE QUE FAIT CETTE FONCTION, ET CE QU'ELLE NE FAIT PAS
--
-- Elle dit, pour une liste de rendez-vous, lesquels ont un lien actif et
-- jusqu'à quand. Elle ne renvoie **jamais** de jeton ni d'empreinte : le jeton
-- en clair n'existe plus nulle part après sa création, c'est voulu, et le
-- rendre lisible reviendrait à transformer une empreinte en secret partagé.
--
-- Un lien perdu ne se retrouve donc pas : il se régénère, ce qui invalide
-- l'ancien. L'interface doit le dire clairement plutôt que de le faire dans le
-- dos du garage.

create function public.etat_liens_atelier(p_rdv_ids uuid[])
returns table (rendez_vous_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select j.rendez_vous_id, j.expires_at
  from public.atelier_jetons j
  join public.rendez_vous rv on rv.id = j.rendez_vous_id
  join public.garages g on g.id = rv.garage_id
  where g.owner_user_id = auth.uid()
    and j.rendez_vous_id = any(p_rdv_ids)
    and j.revoked_at is null
    and j.expires_at > now();
$$;

comment on function public.etat_liens_atelier(uuid[]) is
  'Pour une liste de rendez-vous appartenant au garage de l''appelant, indique lesquels ont un lien atelier actif et jusqu''à quand. Ne renvoie jamais de jeton ni d''empreinte : le jeton en clair n''existe plus après sa création. Sert à ne pas révoquer par inadvertance un QR déjà remis à un client.';

-- `security definer` est nécessaire : `atelier_jetons` est fermée à tous les
-- rôles clients, et doit le rester. Le filtre sur `owner_user_id = auth.uid()`
-- est ce qui remplace la policy absente — un appelant ne voit que ses propres
-- rendez-vous, quels que soient les identifiants qu'il passe en paramètre.
revoke execute on function public.etat_liens_atelier(uuid[]) from public;
revoke execute on function public.etat_liens_atelier(uuid[]) from anon;
-- Supabase accorde EXECUTE à service_role sur toute fonction neuve de public,
-- par privilège par défaut : la révocation est nécessaire, pas redondante.
revoke execute on function public.etat_liens_atelier(uuid[]) from service_role;
grant execute on function public.etat_liens_atelier(uuid[]) to authenticated;

-- =====================================================================
-- Vérification dans la transaction de la migration
-- =====================================================================

do $$
declare
  v_pb text := '';
begin
  if has_function_privilege('anon', 'public.etat_liens_atelier(uuid[])', 'EXECUTE')
     or has_function_privilege('service_role', 'public.etat_liens_atelier(uuid[])', 'EXECUTE') then
    v_pb := v_pb || 'etat_liens_atelier ouverte a anon ou service_role; ';
  end if;
  if not has_function_privilege('authenticated', 'public.etat_liens_atelier(uuid[])', 'EXECUTE') then
    v_pb := v_pb || 'authenticated ne peut pas lire l''etat de ses liens; ';
  end if;

  -- La table doit rester fermée : c'est toute la raison d'être de la fonction.
  -- Si une policy ou un privilège apparaissait sur atelier_jetons, il faudrait
  -- reconsidérer ce lot plutôt que d'empiler les deux chemins d'accès.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'atelier_jetons'
      and grantee in ('anon', 'authenticated')
  ) then
    v_pb := v_pb || 'atelier_jetons est devenue accessible directement; ';
  end if;

  if v_pb <> '' then
    raise exception 'lot etat liens atelier v1: %', v_pb;
  end if;
end;
$$;

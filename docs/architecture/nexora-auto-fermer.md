# Fermer Nexora Auto — la page à ouvrir dans l'urgence

Une page, trois gestes, et ce qu'ils font vraiment. Mesuré le 17 septembre
2026 (`scripts/recette/fermeture-beta.mjs`, 14 contrôles). **Aucun de ces
gestes ne touche Nexora Pro.**

## Le geste qui coupe vraiment l'accès aux données

Éditeur SQL du projet de **Production** (`omphppsmhmyllapdqevn`) :

```sql
update public.auto_acces_parametres set mode = 'ferme';
```

**Effet : immédiat, sans redéploiement, y compris pour un onglet déjà ouvert.**

| | Après ce geste |
| --- | --- |
| `/auto`, `/auto/connexion` | « Nexora Auto arrive bientôt » |
| Routes `/api/auto/*` | 403 |
| Session déjà ouverte, lecture directe de la base | **plus rien** (0 ligne) |
| Session déjà ouverte, écriture directe | **refusée** |
| Fichier jamais téléchargé | refusé |
| Nouvelles adresses signées | refusées |
| Nexora Pro | **intact** : la politique restrictive ne vise que le compartiment `auto-documents` |

**La seule limite, mesurée :** un fichier **déjà téléchargé** par une session
peut encore lui être servi pendant au plus **une heure** (cache du stockage
Supabase, `Cache-Control: public, max-age=3600`). Un autre compte est refusé,
et un fichier jamais téléchargé aussi. Pour couper au fichier près, supprimer
le document — le fichier part du stockage.

## Retirer une seule personne

```sql
delete from public.auto_acces_beta where email = 'adresse@exemple.fr';
```

Même effet immédiat, pour elle seule. Ses données restent en base ; elle n'y
accède plus. (Pour l'effacement, voir la décision D3.)

## Le geste qui ne ferme que l'affiche

Variable `AUTO_ACCES=ferme` dans Vercel, environnement Production.

**Effet : au redéploiement seulement, et il ne protège PAS les données.** Les
écrans et les routes se ferment, mais **une session déjà ouverte continue de
lire et d'écrire** directement dans Supabase : le navigateur parle à la base,
pas à nos routes. À n'utiliser que pour retirer l'application de l'affiche,
jamais pour couper l'accès à des données.

## Rouvrir

```sql
update public.auto_acces_parametres set mode = 'beta';   -- adresses invitées
update public.auto_acces_parametres set mode = 'ouvert';  -- tout compte confirmé
```

`ouvert` est une décision à part : voir `nexora-auto-donnees-personnelles.md`
(D1 sur les durées de conservation, D6 sur les conditions d'utilisation).

## Revenir en arrière côté code

`git revert` du commit de fusion dans `main`. Les tables `auto_*` et les
fichiers restent, inertes : **aucune donnée n'est perdue**. Ne jamais
supprimer les tables sans export préalable et décision explicite ; chaque
migration décrit son retour arrière dans son en-tête.

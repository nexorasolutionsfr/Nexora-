# Connexion Gmail OAuth — staging

Cette procédure concerne uniquement l'environnement de staging Nexora. Elle ne doit pas être appliquée à la production sans une validation séparée.

## 1. Créer ou sélectionner le client OAuth Google de staging

Dans Google Cloud Console, sélectionner le projet dédié au staging puis :

1. Configurer l'écran de consentement OAuth pour une application **External** en mode test.
2. Ajouter les comptes Gmail de test dans **Test users**. Un garage pilote ne doit utiliser que son propre compte Google.
3. Créer un identifiant OAuth de type **Web application**.
4. Ajouter exactement cette URI de redirection autorisée :

   ```text
   https://<domaine-staging>/api/auth/google/callback
   ```

   Pour un test local, créer un client OAuth distinct avec :

   ```text
   http://localhost:3000/api/auth/google/callback
   ```

Le dashboard demande seulement l'autorisation `gmail.readonly` : lecture des e-mails, sans envoi ni suppression.

## 2. Configurer les variables de staging

Dans le fournisseur qui héberge le dashboard de staging (Vercel si le staging y est déployé), définir ces variables **uniquement pour l'environnement Preview/Staging** :

```text
NEXT_PUBLIC_APP_URL=https://<domaine-staging>
NEXT_PUBLIC_SUPABASE_URL=https://kxtcvkxofiuvhtfejcor.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon du staging>
SUPABASE_SERVICE_ROLE_KEY=<clé service_role du staging>
GOOGLE_CLIENT_ID=<client OAuth staging>
GOOGLE_CLIENT_SECRET=<secret OAuth staging>
OAUTH_STATE_SECRET=<secret aléatoire d'au moins 32 caractères>
```

Ne jamais placer `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_SECRET` ou `OAUTH_STATE_SECRET` dans le dépôt, une variable `NEXT_PUBLIC_*`, n8n, ou le navigateur.

Après l'ajout des variables, redéployer le staging. Les variables serveur ne sont lues qu'au démarrage du déploiement.

## 3. Vérification fonctionnelle sans automatisation réelle

1. Se connecter au dashboard avec le compte garage pilote de staging.
2. Ouvrir **Paramètres → Intégrations**.
3. Vérifier que seule **Boîte Gmail** est proposée.
4. Cliquer **Connecter ma boîte mail** et choisir le compte Gmail de test autorisé dans Google.
5. Vérifier le retour au dashboard avec le badge `Connectée · adresse@exemple.fr`.
6. Dans Supabase staging, vérifier qu'une seule ligne `email_connections` existe pour ce garage et que `gmail_connecte` est à `true`.

Ne pas activer les workflows n8n ni lancer de synchronisation Gmail durant ce test. Cette étape valide seulement l'autorisation et le stockage sécurisé de la connexion.

## 4. Critères de refus

Le test doit s'arrêter si :

- l'URL de retour ne correspond pas exactement à celle déclarée dans Google ;
- le client OAuth de production est utilisé par le staging ;
- un autre compte que le propriétaire du garage peut initier la connexion ;
- une option SMS, WhatsApp, paiement ou automatisation devient accessible au pilote.

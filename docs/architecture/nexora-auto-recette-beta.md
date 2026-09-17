# Nexora Auto — recette courte : vrai téléphone et vraies factures

But : vérifier la promesse « Nexora me simplifie vraiment la vie avec ma
voiture », en observant de vraies personnes **sans les guider**. Préparé le
17 septembre 2026 ; rien n'a encore été joué.

## 1. Deux temps, deux environnements

| Temps | Qui | Où | Données |
| --- | --- | --- | --- |
| **A0. Inscription réelle** | Baptiste | serveur local, base **Test** | votre adresse ou une boîte dédiée, **sur votre accord** (section 1 bis) |
| **A. Recette interne** | Baptiste, sur son téléphone | serveur local sur le Mac, base **Test**, même Wi-Fi | compte fictif `@nexora-recette.invalid` ; 3 à 5 **de vos propres** factures (décision D8), supprimées après la mesure |
| **B. Bêta observée** | 3 à 5 personnes invitées | **Production en mode bêta**, après la mise en ligne contrôlée (`nexora-auto-livraison.md`) | leurs vraies données, dans l'environnement prévu pour cela |

**Pourquoi pas de personnes extérieures sur Test ni sur une prévisualisation Vercel ?**
- Test n'est pas prévu pour les données de tiers.
- Les prévisualisations sont reliées à la base de Production et réservées aux membres du compte Vercel.
- La bêta B suppose donc les décisions de mise en ligne, et la politique de confidentialité à jour (`nexora-auto-donnees-personnelles.md`).

## 1 bis. Temps A0 : l'inscription réelle, de l'invitation à la voiture

**Rien n'est envoyé avant votre accord.** Il me faut deux choses :

1. votre **accord explicite** pour qu'un e-mail réel soit envoyé ;
2. **l'adresse** à utiliser : la vôtre, ou une boîte dédiée à la recette.

### Ce qu'il faut vérifier avant (5 minutes, dans Supabase)

Projet **Test** → *Authentication* → *Emails* / *SMTP Settings* :

- **Si un SMTP dédié est configuré** (Brevo, comme en Production) : n'importe quelle adresse peut recevoir l'e-mail.
- **Sinon**, l'envoi par défaut de Supabase n'accepte **que les adresses des membres du projet**, et **2 messages par heure** (documentation Supabase). Toute autre adresse reçoit l'erreur « Email address not authorized ». Dans ce cas : utiliser votre adresse de membre, et compter une inscription et un renvoi par heure au maximum.

À noter aussi : la durée de validité du lien de confirmation et les adresses
de redirection autorisées (*URL Configuration*) doivent inclure l'adresse du
serveur utilisé (par exemple `http://192.168.x.x:3115` pour un essai sur
téléphone en Wi-Fi local).

### Le parcours à jouer

| # | Geste | Attendu |
| --- | --- | --- |
| 1 | J'invite l'adresse : `node scripts/recette/beta.mjs inviter <adresse> "recette A0"` | l'adresse figure dans la liste, **aucun message envoyé** |
| 2 | Sur le téléphone (ou le Mac), ouvrir `/auto/connexion?mode=inscription`, saisir l'adresse et un mot de passe de 8 caractères au moins | écran « Vérifiez vos e-mails », texte neutre |
| 3 | Ouvrir l'e-mail reçu | expéditeur, objet et texte lisibles ; noter le délai de réception |
| 4 | Ouvrir le lien depuis le téléphone | retour dans Nexora, **connecté**, sur l'accueil du garage |
| 5 | Ajouter la voiture | la voiture apparaît, avec le mot d'accueil et « Pour bien démarrer » |
| 6 | Se déconnecter, puis se reconnecter avec le mot de passe | retour dans le garage, la voiture est là |
| 7 | Rouvrir **le même lien** de confirmation | message clair « ce lien n'est plus valable », sans écran cassé |
| 8 | Demander « Mot de passe oublié », ouvrir le lien, choisir un nouveau mot de passe | message neutre, puis connexion avec le nouveau mot de passe |

Contrôle complémentaire, sans e-mail : une adresse **non invitée** doit
obtenir le même écran neutre, et **aucun compte** ne doit être créé
(déjà vérifié le 17 septembre ; à refaire si l'envoi change).

### Ce qu'on relève

Délai de réception de chaque e-mail, expéditeur affiché, lisibilité sur
téléphone, comportement du lien (ouvre-t-il le bon navigateur ?), écrans
rencontrés, messages d'erreur mot pour mot.

### Après le test

- Si l'adresse utilisée est une vraie adresse : décider du sort du compte de Test (le garder pour la suite, ou le supprimer avec ses données).
- Retirer l'adresse de la liste si le compte est supprimé : `node scripts/recette/beta.mjs retirer <adresse>`.
- Relever les fichiers orphelins.

## 2. Préparer le temps A (10 minutes)

1. Sur le Mac, construire puis servir la version de production :
   ```bash
   npx next build && npx next start -p 3115
   ```
2. Vérifier que Test est en bêta et que le compte est invité :
   ```bash
   node scripts/recette/beta.mjs etat
   ```
3. Ouvrir la session sur le téléphone : le script affiche un QR code, valable une heure.
   ```bash
   node scripts/recette/telephone.mjs recette.auto.202609171124@nexora-recette.invalid
   ```
4. Avant de commencer, vider le dossier du compte (jeu fictif précédent) et **noter l'heure**.

## 3. Le parcours (sans aide)

Consigne unique, lue une fois : « Voici une application pour suivre votre
voiture. Faites comme si vous la découvriez chez vous. Je ne réponds pas aux
questions pendant l'essai ; dites à voix haute ce que vous pensez. »

| # | Tâche donnée | Réussi si… |
| --- | --- | --- |
| 1 | « Ajoutez votre voiture. » | la voiture apparaît dans « Mon garage » |
| 2 | « Dites-moi ce que vous apprend son dossier. » | la personne nomme au moins le contrôle technique ou la révision, et ce qui manque |
| 3 | « Ajoutez cette facture » (PDF reçu par e-mail ou déjà sur le téléphone) | le document est déposé |
| 4 | « Vérifiez et corrigez si besoin, puis enregistrez. » | l'intervention est enregistrée avec la bonne date, le bon montant et le bon kilométrage |
| 5 | « Prenez en photo une autre facture papier et gardez-la. » | photo déposée, informations saisies à la main ou laissées « à compléter » |
| 6 | « Retrouvez quand passer le prochain contrôle technique, puis retrouvez la facture de l'étape 3. » | les deux sont trouvés sans détour |
| 7 | « Qu'est-ce qui vous serait utile la prochaine fois ? » | réponse notée telle quelle |

## 4. Ce qu'on relève

Une ligne par tâche, sans interpréter pendant l'essai.

| Relevé | Comment |
| --- | --- |
| Temps | de la consigne à « réussi » ou à l'abandon |
| Hésitations | pause de plus de 5 s, retour en arrière, menu ouvert puis refermé |
| Erreurs | mauvais écran, mauvais bouton, message d'erreur affiché (recopier le texte) |
| Corrections sur la facture | champs modifiés, et si la proposition était juste, fausse ou absente |
| Abandon | à quelle étape, avec les mots de la personne |
| Téléphone | sélecteur de fichier (où est la facture ?), « Prendre une photo », clavier qui masque un champ, zoom involontaire, orientation |
| Citation | ce que la personne dit à voix haute, mot pour mot |

Après l'essai seulement : « Qu'est-ce qui était le plus pénible ? »,
« Recommanderiez-vous l'application, et à qui ? »

## 5. Mesurer la lecture des factures (temps A)

Après le parcours, sur le Mac :

```bash
node scripts/recette/factures/bilan-reel.mjs recette.auto.202609171124@nexora-recette.invalid --depuis AAAA-MM-JJ
```

- Le bilan compare ce que Nexora a proposé à ce que la personne a confirmé : champs extraits, manqués, erronés, absences justes, champs inventés, temps de chaque étape.
- Par défaut, aucune valeur n'est affichée ; `--details` montre les valeurs, à ne pas copier ailleurs.
- **Limite :** une erreur que la personne n'a pas corrigée n'est pas vue. Relire soi-même chaque intervention enregistrée avec la facture sous les yeux.
- Les factures déposées sont ensuite supprimées : depuis l'application (documents, interventions), puis relevé des fichiers orphelins avec `supabase db query --linked -f supabase/tests/auto_fichiers_orphelins.sql`.

## 6. Préparer le temps B (décisions nécessaires)

1. Mise en ligne contrôlée en mode `ferme`, puis `beta` (section 5 de `nexora-auto-livraison.md`).
2. Politique de confidentialité et conditions à jour, décisions D1 à D7.
3. Inviter les adresses, sans rien envoyer depuis Nexora : Baptiste prévient lui-même chaque personne. Le SQL figure dans le document de livraison.
4. Même parcours, mêmes relevés ; observation en présence, ou en visio avec partage d'écran du téléphone, avec l'accord de la personne.
5. Aucune capture ni enregistrement sans accord écrit ; aucune donnée de la personne recopiée dans les notes, sauf ses citations.

## 7. Restitution

Un tableau par personne (tâches × relevés), puis une synthèse :

- tâches réussies sans aide ;
- les 3 obstacles les plus fréquents, avec la citation qui les illustre ;
- les corrections de factures par champ ;
- les demandes « la prochaine fois ».

Les améliorations suivantes se choisissent à partir de ce tableau, pas
avant.

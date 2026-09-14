# Point de reprise — PR #101 (constat → devis, modèles, suivi, relances)

Mis à jour le 15 septembre 2026, nuit, après la passe de fiabilisation. Sert à
continuer dans une autre session. **Ne présente comme fait que ce qui est
listé sous « Fait ».**

## État

- Branche `integ/constat-devis-suivi`, **PR #101 ouverte, non fusionnée**
  (https://github.com/nexorasolutionsfr/Nexora-/pull/101).
- Tête de la passe de fiabilisation : **`acecd56`** (voir `git log` pour la
  tête exacte si des commits de recette écran ont suivi).
- Migrations **appliquées sur Test** : `20260919000100` → `001000`.
  **Rien en Production.**
- n8n : instance vive intacte. Instance isolée `nexora-n8n-recette` (Docker,
  127.0.0.1:5679) contenant seulement : `RPC Supabase RECETTE (Test)`,
  `SMTP recette contrôlé`, workflows `relancestravauxtest0000001` et
  `relancestravauxsmtp0000001`, tous inactifs.

## Fait (passe de fiabilisation) — détail : `fiabilisation-envois-2026-09-15.md`

| Point | Résultat |
|---|---|
| 1. Empreinte du devis | reproduit (réservé à tort) puis corrigé : libellé, constat, photo → mis de côté |
| 2. Transport réel | expéditeur du socle + Reply-To garage ; classement ancré (8 tests) ; vraie variante exécutée contre SMTP contrôlé, 2 passages conformes |
| 3. Conditions d'envoi | opposition vérifiée préparation / autorisation / réservation (9/19 → 19/19) ; manques documentés, activation bloquée |
| 4. Publication / retour arrière | plan réécrit ; compatibilité `main` sur base jetable : 15 contrôles OK |
| 5. Barrière de recette | 102 OK / 0 KO / 0 erreur, VERT ; 3 échecs volontaires → code 1 |
| Non-régression | unitaires 504 ; serveur 34 / 27 / 20 / 35 ; `next build` OK |

## Prochaine action (brief de nuit, étapes 2 à 5)

2. Parcours complet au navigateur sur Test, garage fictif isolé : mécanicien
   (constat + photo) → accueil/dirigeant (devis, prix, modèle) → client (lien,
   photos, réponse) → garage (réponse, prochaine action) → suivi partagé.
3. Corriger les frictions locales trouvées, vérifier bureau + 375 px.
4. Feuille de route et plan n8n à jour (publié / testé non publié / simulé /
   dépendance / non commencé).
5. Livraison : PR + SHA, captures, gestes à vérifier au réveil,
   recommandation dashboard/base et relances séparées.

## Accès recette (Test)

Serveur local `http://localhost:3000` (config `nexora-constat-devis`).
Lien de connexion : `node scripts/recette/acces-test.mjs lien <email> 3000`.
SMTP contrôlé : `PORT=2526 JOURNAL=… node scripts/recette/smtp-controle.mjs`.

## Non commencé

Lot 4 (import CSV). Saisie de l'opposition à l'écran. Avis Google, IMAP.

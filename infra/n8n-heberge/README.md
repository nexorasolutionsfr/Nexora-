# n8n hébergé — pour que les communications partent même quand le Mac dort

Constat qui motive ce dossier : entre 02h35 et 09h22 le 9 septembre 2026, puis
autour de 18h30 le même jour, **aucune automatisation n'a tourné** — le Mac
dormait. Un garage qui attend l'envoi d'un devis attend que l'ordinateur du
fondateur se réveille.

## Ce qu'il faut et ce que ça coûte (vérifié le 10 septembre 2026)

| | Recommandé : **VPS OVHcloud VPS-1** | Alternative : **Hetzner CX (partagé)** | Écarté : n8n Cloud |
|---|---|---|---|
| Prix | **3,81 € HT / 4,57 € TTC par mois** (page ovhcloud.com/fr/vps, offre « VPS 2027 ») | ~4 €/mois + **0,50 € HT/mois l'IPv4** (seul chiffre lisible cette nuit sur docs.hetzner.com ; le prix serveur n'a pas pu être vérifié) | Starter **20 €/mois** (annuel) pour **2 500 exécutions/mois** |
| Machine | 2 vCore, 4 Go, 40 Go NVMe | équivalent | — |
| Localisation | France possible | Allemagne / Finlande | — |
| Sauvegarde | **incluse, quotidienne** (« sauvegarde automatisée 1 jour ») | option payante (% du prix) | gérée |
| Maintenance fondateur | mises à jour Docker ~10 min/mois, restauration testée ci-dessous | idem | aucune |
| Verdict | **oui** | oui si OVH indisponible | **non : le socle seul fait ~2 900 exécutions/jour** (4 workflows × toutes les 2 min), soit ~35× le forfait Starter. Sans passer du sondage aux webhooks, n8n Cloud est hors de portée. |

Le sondage toutes les 2 minutes n'est **pas** un préalable à l'hébergement :
sur un VPS il ne coûte rien. Il ne devient un sujet que si l'on visait n8n Cloud.

## Ce que contient ce dossier

- `docker-compose.yml` — n8n **sur Postgres** (plus de SQLite : celui du Mac a déjà été corrompu une fois, voir `~/Nexora/backup_corrupt_*`), Caddy pour le **HTTPS automatique**, secrets montés en fichiers, volumes persistants, purge des exécutions à 7 jours.
- `Caddyfile` — une ligne : le domaine, et Let's Encrypt fait le reste.
- `sauvegarder.sh` — `pg_dump` à chaud + clé de chiffrement + volume, rétention 14 jours ; à mettre en cron chaque nuit.
- `restaurer.sh` — restauration dans une pile arrêtée ; **refuse** de restaurer si la clé de chiffrement diffère (sinon tous les identifiants seraient illisibles).
- `.env.example` — un seul réglage non secret : le nom de domaine.

Les secrets (`secrets/n8n_encryption_key`, `secrets/postgres_password`) ne
sont jamais dans le dépôt. **La clé de chiffrement doit être celle du Mac**
(`~/Nexora/secrets/encryption_key`) pour que les identifiants exportés
restent lisibles.

## Répétition locale

Répétée cette nuit sur ce Mac dans un projet Docker isolé (`nexora-repetition`,
port 5679, sans Caddy) : voir le compte rendu dans la PR. Ce qui a été
démontré et ce qui ne l'a pas été y est dit explicitement.

## Plan de bascule — un seul consommateur actif, aucune notification perdue

1. **Provisionner** le VPS, installer Docker, copier ce dossier, générer
   `secrets/postgres_password`, **copier** (pas régénérer) la clé de
   chiffrement du Mac, renseigner `.env`, `docker compose up -d`, vérifier
   HTTPS.
2. **Importer** dans le n8n hébergé les identifiants (Supabase Production,
   RPC Supabase Production, SMTP Brevo — envois métier, Header Auth Anthropic)
   — ils se recréent à la main, les valeurs viennent des coffres, jamais des
   exports — puis les workflows `n8n/socle-envois/*.json` et
   `n8n/assistant-garage/production.json`, **tous inactifs**.
3. **Sauvegarde du Mac** (`sqlite3 .backup`, comme le 9 septembre).
4. **Suspendre** les cinq workflows sur le Mac (quatre du socle + Assistant).
   Attendre **5 minutes** et vérifier qu'aucune exécution ne démarre plus.
   Vérifier qu'aucune ligne n'est en `envoi_en_cours` dans les quatre files ;
   s'il y en a, les traiter à la main avant de continuer.
5. **Activer** sur le VPS dans l'ordre : Facture, Proposition RDV, Nouveau
   devis, Véhicule prêt, puis Assistant v2. Après chacun : une exécution
   `success`, zéro erreur, files inchangées.
6. **Critères de réussite** : sur 30 minutes, exécutions toutes les 2 minutes
   sans erreur ; un envoi réel de recette (Test) depuis le VPS reçu en boîte.
7. **Suspension immédiate** si : une exécution en erreur sur un workflow du
   socle, une ligne qui passe en `a_reprendre` ou `incertain`, ou un e-mail
   inattendu. On suspend le VPS, on ne réactive **pas** le Mac à l'aveugle,
   on lit les files d'abord.
8. Le Mac reste **éteint côté n8n** jusqu'à ce que le VPS ait tenu 24 h.

## La seule chose qui manque

**Un nom de domaine** (ou sous-domaine) pointé sur le VPS, pour le HTTPS des
webhooks et de l'interface : `n8n.<domaine>.fr`. Sans domaine, pas de
certificat, donc pas d'URL de webhook fiable pour le formulaire du site.
C'est la décision d'achat en attente ; le VPS lui-même n'a pas été commandé.

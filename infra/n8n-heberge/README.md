# n8n hébergé — pour que les communications partent même quand le Mac dort

Constat qui motive ce dossier : entre 02h35 et 09h22 le 9 septembre 2026, puis
autour de 18h30 le même jour, **aucune automatisation n'a tourné** — le Mac
dormait. Un garage qui attend l'envoi d'un devis attend que l'ordinateur du
fondateur se réveille.

## Ce qu'il faut et ce que ça coûte (vérifié le 10 septembre 2026)

| | Recommandé : **VPS OVHcloud VPS-1** | Alternative : **Hetzner CX (partagé)** | Écarté : n8n Cloud |
|---|---|---|---|
| Prix | **3,81 € HT / 4,57 € TTC par mois**, **prix d'un engagement 12 mois** (page ovhcloud.com/fr/vps, gamme « VPS 2027 », revérifié le 10 sept. 2026) | ~4 €/mois + **0,50 € HT/mois l'IPv4** (seul chiffre lisible cette nuit sur docs.hetzner.com ; le prix serveur n'a pas pu être vérifié) | Starter **20 €/mois** (annuel) pour **2 500 exécutions/mois** |
| Machine | 2 vCore, 4 Go, 40 Go NVMe | équivalent | — |
| Localisation | France possible | Allemagne / Finlande | — |
| Sauvegarde | incluse mais **24 h de rétention seulement** — voir ci-dessous | option payante (% du prix) | gérée |
| Maintenance fondateur | mises à jour Docker ~10 min/mois, restauration testée ci-dessous | idem | aucune |
| Verdict | **oui** | oui si OVH indisponible | **non : le socle seul fait ~2 900 exécutions/jour** (4 workflows × toutes les 2 min), soit ~35× le forfait Starter. Sans passer du sondage aux webhooks, n8n Cloud est hors de portée. |

Le sondage toutes les 2 minutes n'est **pas** un préalable à l'hébergement :
sur un VPS il ne coûte rien. Il ne devient un sujet que si l'on visait n8n Cloud.

### Ce que la sauvegarde OVH couvre vraiment (revérifié le 10 septembre 2026)

Le prix affiché suppose un **engagement de 12 mois**. Un engagement mensuel
existe mais à un tarif plus élevé ; le renouvellement se fait au tarif de la
formule souscrite. À confirmer sur le bon de commande avant de valider.

La « sauvegarde automatisée » incluse est la formule **Standard : une copie par
jour, conservée 24 heures**. Il faut en tirer trois conséquences :

- **un seul point de restauration**, remplacé chaque nuit. Une erreur repérée
  le surlendemain n'est plus rattrapable par ce moyen ;
- la restauration se fait **au niveau de la machine entière**, depuis l'espace
  client — on ne récupère pas une base ou un workflow isolément ;
- la formule **Premium (7 jours de rétention)** est une **option payante**,
  dont le prix dépend du stockage du VPS.

Conclusion : cette sauvegarde couvre la panne matérielle de la nuit dernière.
Elle ne couvre pas la bêtise humaine. C'est `sauvegarder.sh` qui joue ce rôle —
`pg_dump` + clé de chiffrement + volume, 14 jours de rétention.

**Défaut à corriger avant la bascule** : `sauvegarder.sh` écrit dans
`./sauvegardes`, c'est-à-dire **sur le disque du VPS**. Si la machine est
perdue, les sauvegardes le sont avec elle. Il faut une copie hors machine
(`rsync` vers le Mac, un stockage objet, ou l'option Premium en complément).
Rien de tout cela n'est en place aujourd'hui.

### Ressources : VPS-1 suffit

n8n au repos ~500 Mo, Postgres ~200 Mo, Caddy ~30 Mo : les 4 Go du VPS-1
laissent de la marge. Côté disque, la purge est déjà réglée à 7 jours et
20 000 exécutions (`EXECUTIONS_DATA_PRUNE`), ce qui borne la table
d'exécutions à quelques Go sur les 40 Go disponibles. Les ~2 900 exécutions
par jour du socle sont du sondage : elles coûtent du CPU par à-coups, pas de
la mémoire. Passer à VPS-2 ne se justifierait qu'en ajoutant des workflows
lourds — pas pour ce périmètre.

### Ce qui exige réellement un domaine

Le domaine n'est pas nécessaire pour faire tourner n8n : il l'est pour deux
choses précises.

1. **Les webhooks entrants** (`demande-site`, `demande-whatsapp`). Le
   formulaire du site et Twilio appellent une URL publique et stable ; une
   adresse IP nue, sans certificat valide, est refusée par Twilio et
   déconseillée pour le site.
2. **Le certificat HTTPS** de l'interface n8n : Let's Encrypt ne délivre pas
   de certificat pour une adresse IP.

Ce qui **n'**exige **pas** de domaine : les tournées à heure fixe (avis,
relance), le relevé IMAP, et tous les appels sortants vers Supabase et Brevo.
Autrement dit, une bascule sans domaine ferait tourner tout le reste et
laisserait les deux webhooks sur le Mac — mélange à éviter.

Un **sous-domaine d'un domaine déjà possédé suffit**. Si aucun domaine n'est
détenu (`parametres_envois.url_publique` pointe aujourd'hui sur
`nexora-garage.vercel.app`), c'est un achat d'une dizaine d'euros par an —
la seule dépense en plus du VPS.

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

Deux répétitions, dont la seconde est celle qui compte.

**02 h 00 — `REPETITION-2026-09-10.log`.** Deux workflows, zéro actif. Elle
valide le couple `sauvegarder.sh` / `restaurer.sh`, rien de plus : ce n'était
pas l'instance réelle.

**08 h 24 — `REPETITION-2026-09-10-complete.log`.** L'instance réelle, recopiée
et rejouée sur la pile cible : **19 workflows, 9 identifiants chiffrés**,
SQLite → Postgres, déchiffrement prouvé avec la clé restaurée, activation
délibérée d'un seul workflow, sauvegarde, destruction totale (`down -v`),
restauration, état d'activation retrouvé à l'identique. Conteneurs sur un
réseau `internal` : sortie vers Brevo, Supabase et Internet **vérifiée
bloquée** pendant toute la répétition.

Le fait marquant : **`n8n import:workflow` importe tout en inactif.** Sur le
Mac, 7 workflows sont actifs ; après import, 0. Une bascule ne peut donc pas
faire repartir des envois par accident — mais l'activation est un geste
manuel, workflow par workflow, qui ne peut pas être automatisé.

Non répété : Caddy et le HTTPS (exigent un domaine et une sortie réseau), et
le comportement en charge.

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

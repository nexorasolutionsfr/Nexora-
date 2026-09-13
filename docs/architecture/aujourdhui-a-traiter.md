# « À traiter » — la correspondance, avant tout code

14 septembre 2026. Établie **avant** de modifier quoi que ce soit, pour qu'aucune
tâche ne se perde et qu'aucun comportement ne change en silence.

## Le constat

En Production, `NEXT_PUBLIC_COCKPIT_OPPORTUNITES_ACTIF=true` : **deux écrans
cohabitent** sur Aujourd'hui. Le nouvel écran donne ses priorités par
intervention ; le Cockpit donne les siennes par source. Une inspection en
attente apparaît dans le Cockpit **et** dans la pastille « Nexora a repéré ».
Un devis accepté peut apparaître trois fois : priorité d'intervention,
« réponse des clients » du Cockpit, et pastille.

## Deux moteurs existants, aucun troisième

| Moteur | Fichier | Ce qu'il sait |
|---|---|---|
| `deriveOpportunites` | `components/cockpit/deriveOpportunites.js` | les sources hors atelier, **et le journal** `opportunites_actions` (traité / reporté / réactivé) |
| `classerPriorites` | `components/aujourdhui/priorites.js` | l'intervention : état de l'atelier, notification, documents rattachés |

La liste unique **consomme les deux**. Elle n'ajoute aucune règle métier : elle
fusionne, dédoublonne, ordonne. C'est le rôle de
`components/aujourdhui/aTraiter.js`.

## La correspondance

`source → identité → condition d'apparition → destination → traitement/report`

### Venant de `deriveOpportunites` (inchangé)

| Source | Identité | Apparaît quand | Destination | Traitement / report |
|---|---|---|---|---|
| Demande Gmail | `demande:<id>` | statut `nouveau` ou `infos_manquantes` | ouvre la demande | journal ; pas de réactivation auto |
| Créneau proposé | `proposition:<id>` | proposition en attente | écran Valider | journal ; pas de réactivation auto |
| Devis sans réponse | `devis:<id>` | `statut = en_attente` et pas de travail différé lié | ouvre le devis | journal |
| Réponse au devis | `reponse_devis:<id>` | accepté/refusé depuis moins de 2 jours | **dossier du véhicule** (voir fusion ci-dessous) | journal |
| Rappel | `rappel:<id>` | statut actif | appel direct, ou agenda si RDV à créer | journal + **réactivation auto** sur `updated_at` |
| Confirmation RDV | `rdv_confirmation:<id>` | report demandé, ou en attente de confirmation | ouvre le rendez-vous | journal |
| Inspection | `inspection:<id>` | en attente de décision client | ouvre l'inspection | journal + **réactivation auto** |
| Travail différé | `travail_differe:<id>` | `date_relance <= maintenant` et non clos | fiche client | journal + **réactivation auto** ; report par date |

### Venant de `classerPriorites` (inchangé)

| Raison | Identité | Apparaît quand | Destination |
|---|---|---|---|
| `contradiction` | `rdv:<id>\|contradiction` | l'ordre et l'atelier se contredisent | Atelier |
| `notification_bloquee` | `rdv:<id>\|notification_bloquee` | voiture prête, envoi mis de côté | **aperçu du message** |
| `notification_non_envoyee` | `rdv:<id>\|notification_non_envoyee` | voiture prête, rien d'autorisé | **aperçu du message** |
| `notification_incertaine` | `rdv:<id>\|notification_incertaine` | envoi en cours, issue inconnue | aperçu du message |
| `attendue_en_retard` | `rdv:<id>\|attendue_en_retard` | attendue aujourd'hui, heure passée | dossier du véhicule |
| `creneau_depasse` | `rdv:<id>\|creneau_depasse` | travaux du jour dépassés | Atelier |
| `document_a_envoyer` | `doc:<devis\|facture>:<id>` | document établi, envoi non autorisé | le document, dans le dossier |
| `a_vous_de_jouer` | `rdv:<id>\|a_vous_de_jouer` | le fil pointe un document ou une planification | ce que dit le fil |

## Les trois fusions, et elles seules

1. **`devis:<id>`** — le Cockpit dit « devis sans réponse », la priorité dit
   « devis établi, pas encore envoyé ». Les deux peuvent être vraies en même
   temps. On garde **une** ligne, celle de la priorité : elle nomme la voiture
   et ouvre le dossier, là où le Cockpit renvoie vers la liste des devis.
2. **`reponse_devis:<id>` ⟷ priorité portant le même devis** — même fait, deux
   formulations. On garde celle qui a le véhicule.
3. **`travail_differe:<id>`** — présent dans le Cockpit et dans l'ancienne zone
   « Argent à risque ». La zone disparaît ; la source reste, une fois.

**Aucune autre fusion.** En particulier :

- deux interventions à facturer sur la même voiture = **deux lignes**, et la
  date de la visite les distingue ;
- un report de RDV et des travaux dépassés sur le même rendez-vous = **deux
  lignes** : ce sont deux gestes différents ;
- une inspection et le devis du même client = deux lignes.

## Ce qui ne change pas

- **Une action ne disparaît pas parce qu'elle est ancienne.** Aucun filtre de
  date n'est ajouté. Le seul masquage possible reste le journal, à la main.
- **Une relance future n'est pas dans « À traiter »** : `date_relance > maintenant`
  ne produit pas de candidat. Elle rejoint la liste le jour de son échéance.
  Elle reste visible dans le suivi.
- **« Traiter » ne répare rien, ne facture rien, n'envoie rien.** C'est une
  marque de suivi, écrite dans `opportunites_actions`. Le libellé le dit.
- **Un clic de navigation ne marque rien.** Ouvrir un dossier n'écrit pas dans
  le journal.
- **Les compteurs comptent la liste**, après fusion : une source fusionnée
  compte pour un.

## Un blocage à signaler, pas à contourner

`opportunites_actions` n'est lisible et écrivable que par le **propriétaire**
du garage :

```sql
using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
```

Un compte `accueil` ne voit donc pas le journal : pour lui, rien n'est masqué,
et une ligne traitée par le dirigeant lui réapparaît. **C'est déjà le
comportement actuel du Cockpit**, pas une régression introduite ici. Le corriger
demanderait une migration de politique — hors de ce lot. En attendant, les
commandes « Traité » et « Reporter » ne s'affichent que pour le propriétaire,
plutôt que d'échouer en silence.

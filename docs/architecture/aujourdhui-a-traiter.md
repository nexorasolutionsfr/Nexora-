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

## Les fusions : le même GESTE, pas le même identifiant

> **Corrigé le 14 septembre, avant fusion.** La première version fusionnait dès
> que la priorité *portait* le devis — or `dossiers` rattache à chaque
> rendez-vous n'importe quel devis non refusé du véhicule. Une ligne « travaux
> dépassés » suffisait donc à **faire disparaître** la ligne « Devis accepté
> par … ». Deux gestes différents, une seule ligne affichée, et la réponse du
> client perdue.
>
> Une priorité ne « porte » le devis que si sa raison **parle du devis** :
> `document_a_envoyer` sur un devis, ou `a_vous_de_jouer` dont le fil pointe
> `CIBLE_DEVIS`, `CIBLE_DEVIS_SANS_INTERVENTION` ou `CIBLE_ORDRE`. Créneau
> dépassé, arrivée en retard, message de disponibilité, contradiction : jamais.

1. **`devis:<id>`** — le Cockpit dit « devis sans réponse », la priorité dit
   « devis établi, pas encore envoyé ». Même document, même geste suivant. On
   garde la ligne de la priorité : elle nomme la voiture et ouvre le dossier,
   là où le Cockpit renvoie vers la liste des devis.
2. **`reponse_devis:<id>` ⟷ priorité dont le fil pointe ce devis** — même fait,
   deux formulations. On garde celle qui a le véhicule.

**Une fusion ne fait rien disparaître.** La ligne conservée reprend le détail
du Cockpit (dans sa mention secondaire) **et son identité de source** : sans
cela, « Marquer traité » et « Reporter » disparaissaient pour ce devis. Elle
affiche alors : « Marquer traité ne masque que la réponse du client, pas le
travail sur la voiture ».
3. **`travail_differe:<id>`** — présent dans le Cockpit et dans l'ancienne zone
   « Argent à risque ». La zone disparaît ; la source reste, une fois.

**Aucune autre fusion.** En particulier :

- deux interventions à facturer sur la même voiture = **deux lignes**, et la
  date de la visite les distingue — même si elles partagent le devis ;
- travaux dépassés **+** réponse au devis sur la même voiture = **deux
  lignes** : l'atelier et le client ne demandent pas le même geste ;
- facture à envoyer **+** réponse au devis = **deux lignes** ;
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

Un compte `accueil` ne voit donc pas le journal. **C'est déjà le comportement
actuel du Cockpit**, pas une régression introduite ici. Le corriger demanderait
une migration de politique — hors de ce lot. En attendant, les commandes
« Traité » et « Reporter » ne s'affichent que pour le propriétaire, plutôt que
d'échouer en silence.

> **Ce que la recette ne prouve PAS.** Le dirigeant et l'accueil voient bien le
> même nombre de tâches **au départ** — et c'est tout ce qui a été vérifié.
> Cela ne dit **rien** du suivi une fois qu'une tâche est traitée ou reportée :
> le masquage n'existe que pour le propriétaire. Concrètement, après un
> « Marquer traité » du dirigeant, **l'accueil continue de voir la ligne** et
> peut refaire le geste. Voir le même compteur au départ n'est pas un suivi
> partagé.

# Prévenir avant de prélever — V1

Migration `20260909000800_prochaine_facture_v1.sql`.

## D'où vient ce lot

Le porteur du projet a fait lui-même la répétition générale en mode réel, et a
posé la seule question qui comptait, la carte à la main :

> « Tu es sûr que l'abonnement ne sera pas pris automatiquement après la
> période de 13 jours ? »

**Non. Il l'aurait été.** Un abonnement Stripe avec période d'essai se
déclenche tout seul à l'échéance — c'est le comportement voulu, et c'est aussi
celui qui produit les litiges quand personne n'a prévenu.

## Trois réponses, de la plus forte à la plus faible

### 1. Aucune carte n'est demandée pour ouvrir l'essai

`payment_method_collection: "if_required"` dit à Stripe de ne réclamer un moyen
de paiement que s'il y a quelque chose à encaisser **aujourd'hui**. Avec une
période d'essai, il n'y a rien.

Combiné à `missing_payment_method: "cancel"`, qui existait déjà :

> **Rien ne peut être prélevé à quelqu'un qui n'a rien saisi.** Un essai oublié
> s'éteint tout seul ; il ne devient jamais une ligne sur un relevé bancaire.

C'est un arbitrage assumé. Ça coûte de la conversion — il faudra revenir pour
payer. Sur un premier produit vendu à des garages qui ne connaissent pas encore
Nexora, **la confiance vaut plus que le taux de transformation** : une seule
facture surprise et la réputation est faite.

### 2. Le bandeau annonce le prélèvement une semaine avant

Il fallait d'abord savoir **quand**. Au moment de l'abonnement, `acces_motif`
passe à `abonnement` et `acces_fin` à NULL — l'accès n'a plus de fin, c'est
exact, mais on perdait la date du premier prélèvement.

`garages.abonnement_prochaine_facture` la conserve. Pendant l'essai, c'est
`trial_end` — la date du **premier** prélèvement. Ensuite, la fin de période
courante.

> Stripe a déplacé `current_period_end` au niveau de la **ligne** d'abonnement
> dans ses versions récentes, tout en la gardant à la racine dans les
> anciennes. On lit les deux plutôt que de parier sur une version d'API qui
> changera sans prévenir.

Le bandeau affiche le montant **lu depuis `lib/tarifs.ts`**, la même source que
la page tarifaire et la route de paiement. Un chiffre annoncé qui différerait
de celui prélevé serait le pire des défauts sur cet écran-là.

Un abonnement fermé remet la date à NULL : afficher un prélèvement qui n'aura
jamais lieu serait pire que ne rien afficher.

### 3. L'e-mail — pas encore, et il faut le dire

`onboarding@resend.dev`, l'expéditeur partagé actuellement configuré, **n'a le
droit d'écrire qu'au titulaire du compte Resend**. Un rappel adressé à un
garage serait refusé.

Écrire « nous vous prévenons par e-mail » sans domaine vérifié serait
exactement la promesse qui se découvre le jour du prélèvement. Le texte de la
page tarifaire dit donc ce qui est vrai : *« le montant et la date s'affichent
dans votre espace »*.

**Deux façons de combler ce trou**, dans l'ordre de coût :

- **Gratuit, immédiat** : activer les e-mails de fin d'essai côté Stripe
  (Paramètres → Facturation → abonnements et e-mails). Stripe écrit lui-même,
  trois jours avant, depuis sa propre infrastructure.
- **Plus tard** : un domaine Nexora vérifié chez Resend, et le rappel part de
  `contact@nexora…`.

## Ce qui reste hors de portée du garage

La colonne neuve n'entre pas dans la liste blanche de `authenticated` — même
règle que `20260909000600` et `20260909000700`. Une date de prélèvement que le
garage pourrait repousser lui-même ne serait pas une date de prélèvement.

Il peut en revanche la **lire**, sans quoi le bandeau n'aurait rien à afficher.
La vérification l'exige explicitement.

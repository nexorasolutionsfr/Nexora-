# Contrôle véhicule : moins de gestes — V1

## Le reproche, et ce qu'il recouvrait

« Ce n'est pas clair », « les étapes sont trop longues », « il faut pouvoir
envoyer le lien au client en un clic ». Trois symptômes, trois causes
distinctes.

## 1. Le contrôle partait d'une page vide

Pour chaque élément, il fallait **le créer** (une puce ou une frappe), **puis**
lui choisir un état parmi quatre, **puis** passer à la catégorie suivante — sept
écrans. Un contrôle de vingt points demandait plus de quarante gestes, debout à
côté d'une voiture. C'est plus long que de le noter sur une feuille, donc ça ne
se fait pas.

**La règle est inversée.** Un contrôle réel est presque entièrement « rien à
signaler » : c'est l'exception qui a de la valeur, pas la conformité. Un bouton
pose les vingt points d'un coup, **tous au vert**, et le mécanicien ne touche
que ce qui cloche. Vingt points deviennent un geste.

Trois garde-fous :

- **La liste est dérivée de `SUGGESTIONS_PAR_CATEGORIE`, jamais recopiée.** Une
  première version l'avait réécrite à la main : « Pare-chocs avant » contre
  « Pare-choc avant ». La puce d'ajout reproposait alors un point déjà posé, et
  deux libellés presque identiques cohabitaient. Une liste écrite à deux
  endroits diverge toujours.
- **Relancer l'action ne crée pas de doublons, elle complète** — et n'écrase
  aucun état déjà saisi.
- **La roue de secours n'y est pas.** Beaucoup de véhicules récents n'en ont
  plus, et un point « sans objet » dans chaque contrôle est du bruit. Elle
  reste à une puce de distance.

## 2. Un point conforme occupait 275 pixels

Chaque point affichait en permanence son sélecteur d'état 2×2, sa zone de
commentaire et son bouton photo. Vingt points, **cinq mille pixels de
défilement pour dire vingt fois « rien à signaler »**.

Un point conforme tient maintenant sur **une ligne** — libellé, pastille verte,
« Signaler ». Ce qui mérite de la place, c'est l'exception : elle s'ouvre
d'elle-même et le reste. Une catégorie entière tient sur un écran de téléphone.

`Tout remettre à OK` fait le chemin inverse aussi vite.

## 3. Nexora demandait au garage de faire le travail

Le bouton « Copier le lien client » affichait :

> Lien copié — **partagez-le manuellement avec le client**

Six gestes pour ce que le logiciel est censé alléger : ouvrir sa messagerie,
retrouver le client, coller, rédiger, envoyer.

`components/partage/` ouvre maintenant **SMS, WhatsApp ou e-mail avec le bon
destinataire et le message déjà écrit**. Il reste à appuyer sur envoyer.

**Pourquoi pas un envoi serveur.** Il suppose une clé (Resend, Twilio), un coût
par message, un expéditeur vérifié et un consentement traçable — rien de cela
n'est en place. Le garagiste, lui, a déjà son téléphone, son numéro et ses
conversations. Et c'est la bonne place pour un humain : c'est son client, son
ton, sa responsabilité. **Rien ne part sans lui.**

Le message ne dit jamais « inspection » : c'est le mot du logiciel. Un client
lit « le point sur votre véhicule ». Quand une décision est attendue, le
message le dit — sinon il ouvre le lien sans savoir qu'on attend son accord.

Un canal sans coordonnée **ne s'affiche pas**. Un bouton « SMS » grisé n'aide
personne ; ce qui aide, c'est de lire qu'il faut renseigner le numéro.

## 4. Chaque page dit à quoi elle sert

L'en-tête répétait le nom du garage sur les treize écrans. Un garagiste sait
dans quel garage il est ; ce qu'il ne sait pas toujours, c'est ce qu'on attend
de lui sur un écran qu'il ouvre une fois par semaine. **Même place, contenu
utile.** `Contrôle véhicule` et `Fiches atelier`, qui portaient leur titre à
l'intérieur de la section, rentrent dans le rang.

Et le vocabulaire s'aligne : l'onglet disait « contrôle », le code répondait
« inspection » dans les modales, les boutons et les messages. Deux mots pour la
même chose, c'est déjà une raison de ne pas comprendre. Les tables gardent leur
nom ; l'écran dit « contrôle ».

## 5. L'onglet « Alertes » de Paramètres est retiré

Il dupliquait « Notifications à vérifier », qui est le vrai écran d'échec
d'envoi, et surchargeait Paramètres d'un journal technique que le garage ne
peut pas exploiter. Sa suppression rend `ErreursView` mort, ainsi que la
requête `erreurs_automatisation` **lancée à chaque ouverture du tableau de
bord** : trente lignes et une requête réseau en moins.

Le journal continue d'être alimenté en base. Il n'est simplement plus affiché.

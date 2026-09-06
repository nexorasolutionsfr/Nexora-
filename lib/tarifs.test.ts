import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMPARATIF, JOURS_ESSAI, OFFRES, economieAnnuelle, equivalentMensuel, formaterEuros, lignesIncluses, offre, prix } from './tarifs.ts'

test('les clés d offre sont uniques', () => {
  const cles = OFFRES.map((o) => o.cle)
  assert.equal(new Set(cles).size, cles.length)
})

test('une seule offre est mise en avant', () => {
  // Deux mises en avant ne veulent plus rien dire, zéro laisse le visiteur
  // choisir seul entre trois colonnes.
  assert.equal(OFFRES.filter((o) => o.recommandee).length, 1)
})

test('les prix montent avec les paliers', () => {
  for (let i = 1; i < OFFRES.length; i += 1) {
    assert.ok(OFFRES[i].prixMensuel > OFFRES[i - 1].prixMensuel, `palier ${i} pas plus cher`)
    assert.ok(OFFRES[i].prixAnnuel > OFFRES[i - 1].prixAnnuel, `palier annuel ${i} pas plus cher`)
  }
})

test('l annuel offre bien deux mois', () => {
  // La page annonce « 2 mois offerts » : si le calcul ne suit pas, la promesse
  // affichée devient fausse au moment du paiement.
  for (const o of OFFRES) {
    assert.equal(o.prixAnnuel, o.prixMensuel * 10, `annuel incohérent pour ${o.nom}`)
  }
})

test('l équivalent mensuel annoncé est toujours inférieur au mensuel', () => {
  for (const o of OFFRES) {
    assert.ok(equivalentMensuel(o) < o.prixMensuel, `aucun gain à l année pour ${o.nom}`)
  }
})

test('prix() rend bien le montant de la périodicité demandée', () => {
  const o = OFFRES[0]
  assert.equal(prix(o, 'mensuel'), o.prixMensuel)
  assert.equal(prix(o, 'annuel'), o.prixAnnuel)
})

test('offre() ne rend rien pour une clé inconnue', () => {
  // La route de paiement s appuie dessus pour refuser une offre inventée par
  // l appelant.
  assert.equal(offre('gratuite'), undefined)
  assert.equal(offre(''), undefined)
  assert.ok(offre('atelier'))
})

test('chaque offre est complète', () => {
  for (const o of OFFRES) {
    assert.ok(o.nom && o.accroche && o.pour, `champ vide sur ${o.cle}`)
    assert.ok(o.inclus.length >= 4, `trop peu d arguments sur ${o.cle}`)
    assert.equal(Number.isInteger(o.prixMensuel), true)
  }
})

test('le formatage euro est français et sans centimes', () => {
  assert.match(formaterEuros(129), /129/)
  assert.doesNotMatch(formaterEuros(129), /[.,]00/)
})

test('la durée d essai est celle annoncée partout', () => {
  assert.equal(JOURS_ESSAI, 14)
})

test('l économie annoncée vaut bien deux mensualités', () => {
  // La page affiche « vous économisez X ». Si ce X ne vaut pas deux mois, la
  // promesse du bouton et le chiffre à côté se contredisent sous les yeux du
  // visiteur.
  for (const o of OFFRES) {
    assert.equal(economieAnnuelle(o), o.prixMensuel * 2, `économie fausse pour ${o.nom}`)
  }
})

test('le prix barré est toujours supérieur au prix annuel mensualisé', () => {
  for (const o of OFFRES) {
    assert.ok(o.prixMensuel > equivalentMensuel(o), `barrer 79 € pour afficher plus cher : ${o.nom}`)
  }
})

// Deux promesses ont dû être retirées de la grille le 2026-09-05 parce
// qu'elles ne correspondaient à rien de livré : le multi-utilisateurs, et les
// relances automatiques. Ce test empêche qu'elles reviennent par recopie d'une
// ancienne version, ce qui est exactement la façon dont ce genre d'erreur
// revient.
const PROMESSES_RETIREES = [
  /utilisateur/i,
  /relance/i,
  /sms/i,
  /whatsapp/i,
  /paiement en ligne/i,
  /stock/i,
]

test('aucune offre ne promet une fonctionnalité non livrée', () => {
  for (const o of OFFRES) {
    for (const ligne of o.inclus) {
      for (const interdit of PROMESSES_RETIREES) {
        assert.ok(
          !interdit.test(ligne),
          `"${ligne}" (offre ${o.nom}) évoque une fonctionnalité absente du produit : ${interdit}`,
        )
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Comparatif
// ---------------------------------------------------------------------------

test('le comparatif ne promet rien de non livré non plus', () => {
  // La même règle que pour les cartes : le tableau détaillé est lu par un
  // visiteur sur le point de payer, il engage autant.
  for (const g of COMPARATIF) {
    for (const l of g.lignes) {
      for (const interdit of PROMESSES_RETIREES) {
        assert.ok(!interdit.test(l.intitule), `"${l.intitule}" évoque une fonctionnalité absente`)
        assert.ok(!interdit.test(l.effet), `l'effet de "${l.intitule}" évoque une fonctionnalité absente`)
      }
    }
  }
})

test('les offres sont bien emboîtées', () => {
  // Une ligne incluse dans Essentiel doit l'être dans Atelier et Atelier +,
  // sinon monter de palier ferait PERDRE une fonctionnalité — et les cartes
  // annoncent « Tout l'Essentiel » puis « Tout l'Atelier ».
  for (const g of COMPARATIF) {
    for (const l of g.lignes) {
      if (l.essentiel) assert.ok(l.atelier && l.atelierPlus, `${l.intitule} disparaît en montant de palier`)
      if (l.atelier) assert.ok(l.atelierPlus, `${l.intitule} disparaît en Atelier +`)
    }
  }
})

test('chaque palier apporte quelque chose de plus que le précédent', () => {
  const e = lignesIncluses('essentiel').length
  const a = lignesIncluses('atelier').length
  const p = lignesIncluses('atelier-plus').length
  assert.ok(a > e, "l'Atelier n'apporte rien de plus que l'Essentiel")
  assert.ok(p > a, "l'Atelier + n'apporte rien de plus que l'Atelier")
})

test('chaque ligne du comparatif dit ce que ça change, pas ce que c est', () => {
  for (const g of COMPARATIF) {
    for (const l of g.lignes) {
      assert.ok(l.effet.length > 30, `effet trop court pour "${l.intitule}" : il faut une situation, pas un libellé`)
      assert.ok(l.effet.trim().endsWith('.'), `effet non ponctué pour "${l.intitule}"`)
    }
  }
})

test('chaque intitulé de carte se retrouve dans le comparatif', () => {
  // Sinon le visiteur clique « voir le détail » et ne retrouve pas ce qui l a
  // décidé sur la carte.
  const intitules = COMPARATIF.flatMap((g) => g.lignes.map((l) => l.intitule.toLowerCase()))
  for (const o of OFFRES) {
    for (const ligne of o.inclus) {
      if (ligne.startsWith('Tout ')) continue
      const mot = ligne.toLowerCase().split(/[ ,]/)[0]
      assert.ok(
        intitules.some((i) => i.includes(mot)),
        `"${ligne}" (${o.nom}) n'a pas de ligne correspondante dans le comparatif`,
      )
    }
  }
})


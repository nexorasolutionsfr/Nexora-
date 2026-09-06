import assert from 'node:assert/strict'
import { test } from 'node:test'
import { saluationHoraire, dateLongueFR } from './calculs.js'

// Toutes les heures sont exprimées en UTC et converties en Europe/Paris par la
// fonction elle-même. Le 10/09/2026 est en CEST (UTC+2).
function aParis(heureParis) {
  const utc = String(heureParis - 2).padStart(2, '0')
  return new Date(`2026-09-10T${utc}:30:00Z`)
}

test('saluationHoraire dit Bonjour en journée', () => {
  for (const h of [6, 9, 11, 14, 17]) {
    assert.equal(saluationHoraire(aParis(h)), 'Bonjour', `${h} h à Paris`)
  }
})

test('saluationHoraire dit Bonsoir le soir et la nuit', () => {
  for (const h of [18, 20, 23]) {
    assert.equal(saluationHoraire(aParis(h)), 'Bonsoir', `${h} h à Paris`)
  }
  // 02:30 Paris = 00:30 UTC le même jour.
  assert.equal(saluationHoraire(new Date('2026-09-10T00:30:00Z')), 'Bonsoir', '2 h à Paris')
})

// Régression : `Intl.format()` d'une heure seule en fr-FR rend « 11 h ». Lire
// cette chaîne avec Number() donnait NaN, et la fonction répondait « Bonsoir »
// à midi. Le test échoue si quelqu'un revient à format().
test('la lecture de l heure ne passe pas par la chaîne formatée', () => {
  const midi = new Date('2026-09-10T10:00:00Z') // 12:00 à Paris
  assert.equal(saluationHoraire(midi), 'Bonjour')
  const brut = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23',
  }).format(midi)
  assert.equal(Number.isNaN(Number(brut)), true, 'la chaîne fr-FR reste non numérique : ' + brut)
})

test('les bornes 6 h et 18 h basculent au bon moment', () => {
  assert.equal(saluationHoraire(new Date('2026-09-10T03:59:00Z')), 'Bonsoir') // 5h59
  assert.equal(saluationHoraire(new Date('2026-09-10T04:00:00Z')), 'Bonjour') // 6h00
  assert.equal(saluationHoraire(new Date('2026-09-10T15:59:00Z')), 'Bonjour') // 17h59
  assert.equal(saluationHoraire(new Date('2026-09-10T16:00:00Z')), 'Bonsoir') // 18h00
})

test('dateLongueFR met une majuscule au jour', () => {
  assert.equal(dateLongueFR(new Date('2026-09-10T10:00:00Z')), 'Jeudi 10 septembre 2026')
})

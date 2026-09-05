import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HEURES_DEFAUT,
  clefJour,
  estFerme,
  heureReservable,
  heuresOuvrables,
  plagesDuJour,
} from './horaires.js'

// 2026-09-05 est un samedi, 2026-09-07 un lundi.
const SAMEDI = new Date(2026, 8, 5)
const LUNDI = new Date(2026, 8, 7)
const DIMANCHE = new Date(2026, 8, 6)

const HORAIRES = {
  '1': [['08:00', '12:00'], ['14:00', '18:00']],
  '6': [],
  '7': [],
}

test('les jours sont indexés 1 = lundi, 7 = dimanche, comme en base', () => {
  assert.equal(clefJour(LUNDI), '1')
  assert.equal(clefJour(SAMEDI), '6')
  assert.equal(clefJour(DIMANCHE), '7')
})

test('un jour sans plage est une fermeture', () => {
  assert.equal(estFerme(HORAIRES, SAMEDI), true)
  assert.equal(estFerme(HORAIRES, LUNDI), false)
})

test('des horaires absents ne sont pas une fermeture', () => {
  // On n'annonce pas au garage qu'il est fermé parce qu'on ne sait pas.
  assert.equal(estFerme(null, SAMEDI), false)
  assert.equal(estFerme(undefined, SAMEDI), false)
  assert.equal(plagesDuJour(null, SAMEDI), null)
})

test('sans horaires, la grille reste celle d’avant', () => {
  assert.deepEqual(heuresOuvrables(null, SAMEDI), HEURES_DEFAUT)
})

test('la grille suit les plages, coupure de midi comprise', () => {
  assert.deepEqual(heuresOuvrables(HORAIRES, LUNDI), [
    '08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00',
  ])
})

test('une fermeture à 12:00 pile ne laisse pas l’heure de midi ouverte', () => {
  assert.deepEqual(heuresOuvrables({ '1': [['08:00', '12:00']] }, LUNDI),
    ['08:00', '09:00', '10:00', '11:00'])
  // Mais une fermeture à 12:30, oui : il reste une demi-heure à vendre.
  assert.deepEqual(heuresOuvrables({ '1': [['08:00', '12:30']] }, LUNDI),
    ['08:00', '09:00', '10:00', '11:00', '12:00'])
})

test('un jour fermé n’affiche aucune heure… sauf celles déjà prises', () => {
  assert.deepEqual(heuresOuvrables(HORAIRES, SAMEDI), [])
  // La règle qu'on ne viole jamais : un dépannage du samedi reste visible.
  assert.deepEqual(heuresOuvrables(HORAIRES, SAMEDI, ['10:30']), ['10:00'])
})

test('un rendez-vous hors plage un jour ouvert reste affiché', () => {
  const heures = heuresOuvrables(HORAIRES, LUNDI, ['07:15', '19:00'])
  assert.ok(heures.includes('07:00'), 'le client de 7 h a disparu de l’agenda')
  assert.ok(heures.includes('19:00'), 'la voiture rendue à 19 h a disparu')
  assert.equal(heures[0], '07:00')
})

test('deux rendez-vous dans la même heure ne la comptent qu’une fois', () => {
  assert.deepEqual(heuresOuvrables({ '6': [] }, SAMEDI, ['10:00', '10:45']), ['10:00'])
})

test('une plage mal formée est ignorée plutôt que de tout casser', () => {
  assert.deepEqual(plagesDuJour({ '1': [['08:00'], 'nimporte', ['18:00', '08:00']] }, LUNDI), [])
  assert.deepEqual(heuresOuvrables({ '1': [['08:00', '09:00'], null] }, LUNDI), ['08:00'])
})

test('on ne propose pas de créneau hors des heures d’ouverture', () => {
  assert.equal(heureReservable(HORAIRES, LUNDI, '09:00'), true)
  assert.equal(heureReservable(HORAIRES, LUNDI, '12:00'), false)
  assert.equal(heureReservable(HORAIRES, SAMEDI, '10:00'), false)
  // Horaires inconnus : on n'empêche rien.
  assert.equal(heureReservable(null, SAMEDI, '10:00'), true)
})

test('une heure partiellement ouverte reste réservable', () => {
  // Horaires réels d'un garage : ouverture à 08:30. La tranche de 08:00
  // contient une demi-heure à vendre — la déclarer « hors ouverture » la perd.
  const h = { '5': [['08:30', '12:00'], ['14:00', '18:00']] }
  const VENDREDI = new Date(2026, 8, 4)
  assert.equal(heureReservable(h, VENDREDI, '08:00'), true)
  assert.equal(heureReservable(h, VENDREDI, '11:00'), true)
  // 12:00 est la fermeture pile : plus rien à vendre avant 14:00.
  assert.equal(heureReservable(h, VENDREDI, '12:00'), false)
  assert.equal(heureReservable(h, VENDREDI, '13:00'), false)
  assert.equal(heureReservable(h, VENDREDI, '17:00'), true)
  assert.equal(heureReservable(h, VENDREDI, '18:00'), false)
})

test('la tranche d’ouverture partielle figure bien dans la grille', () => {
  const h = { '5': [['08:30', '12:00'], ['14:00', '18:00']] }
  const heures = heuresOuvrables(h, new Date(2026, 8, 4))
  assert.equal(heures[0], '08:00')
  assert.equal(heures.includes('12:00'), false)
  assert.equal(heures.at(-1), '17:00')
})

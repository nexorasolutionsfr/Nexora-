import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  lienMail,
  lienSms,
  lienWhatsApp,
  messagePartage,
  normaliserTelephone,
  numeroWhatsApp,
} from './lien.js'

test('un numéro français devient international', () => {
  assert.equal(normaliserTelephone('06 12 34 56 78'), '+33612345678')
  assert.equal(normaliserTelephone('06.12.34.56.78'), '+33612345678')
  assert.equal(normaliserTelephone('+33 6 12 34 56 78'), '+33612345678')
})

test('un numéro absent ou vide ne fabrique pas de lien', () => {
  for (const v of [null, undefined, '', '   ', 42]) {
    assert.equal(normaliserTelephone(v), null, String(v))
    assert.equal(lienSms(v, 'coucou'), null)
    assert.equal(lienWhatsApp(v, 'coucou'), null)
  }
})

test('WhatsApp veut des chiffres sans le plus, et refuse un numéro trop court', () => {
  assert.equal(numeroWhatsApp('06 12 34 56 78'), '33612345678')
  assert.equal(numeroWhatsApp('12 34'), null)
})

test('le message ne dit jamais « inspection » au client', () => {
  const m = messagePartage({ type: 'controle', garage: 'Garage Dupont', vehicule: 'DM-208-XY', url: 'https://x/i/abc' })
  assert.ok(!/inspection/i.test(m.corps))
  assert.ok(!/inspection/i.test(m.objet))
  assert.ok(m.corps.includes('https://x/i/abc'))
  assert.ok(m.corps.includes('Garage Dupont'))
  assert.ok(m.objet.includes('DM-208-XY'))
})

test('quand une décision est attendue, le message le dit', () => {
  const avec = messagePartage({ type: 'controle', url: 'u', decisionAttendue: true })
  const sans = messagePartage({ type: 'controle', url: 'u' })
  assert.ok(/accord/i.test(avec.corps))
  assert.ok(!/accord/i.test(sans.corps))
})

test('sans véhicule ni garage, le message reste correct', () => {
  const m = messagePartage({ type: 'devis', url: 'https://x/devis/abc' })
  assert.equal(m.objet, 'Votre devis')
  assert.ok(m.corps.startsWith('Bonjour,'))
  assert.ok(!m.corps.includes('()'))
  assert.ok(!m.corps.endsWith('\n'))
})

test('les liens encodent le message, retours à la ligne compris', () => {
  const sms = lienSms('0612345678', 'Bonjour,\nvoici le lien')
  assert.ok(sms.startsWith('sms:+33612345678?&body='))
  assert.ok(sms.includes('%0A'))
  assert.ok(!sms.includes(' '))
})

test('un e-mail sans arobase ne fabrique pas de lien', () => {
  assert.equal(lienMail('pas-un-email', 'o', 'c'), null)
  assert.equal(lienMail(null, 'o', 'c'), null)
  assert.ok(lienMail('a@b.fr', 'Objet', 'Corps').startsWith('mailto:a@b.fr?subject=Objet'))
})

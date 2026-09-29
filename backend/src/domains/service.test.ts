import { describe, expect, test } from 'bun:test'

import { lookupRdap, parseKzWhois, renewalState } from './service'

describe('parseKzWhois', () => {
  const whois = [
    'Domain Name............: artemis.kz',
    'Domain created.........: 2024-09-08 09:54:41 (GMT+0:00)',
    'Current Registrar......: ICPS',
  ].join('\n')

  test('estimates expiry as the next registration anniversary and reads the registrar', () => {
    const result = parseKzWhois(whois, new Date('2026-09-29T12:00:00Z'))
    expect(result?.expiresAt?.toISOString().slice(0, 10)).toBe('2027-09-08')
    expect(result?.registrar).toBe('ICPS')
    expect(parseKzWhois(whois, new Date('2026-09-01T00:00:00Z'))?.expiresAt?.toISOString().slice(0, 10)).toBe(
      '2026-09-08',
    )
  })

  test('is at least one year after registration and null without a creation date', () => {
    const fresh = whois.replace('2024-09-08', '2026-09-08')
    expect(parseKzWhois(fresh, new Date('2026-09-10T00:00:00Z'))?.expiresAt?.toISOString().slice(0, 10)).toBe(
      '2027-09-08',
    )
    expect(parseKzWhois('No entries found', new Date())).toBeNull()
  })
})

describe('lookupRdap', () => {
  test('reads the expiration event and registrar name', async () => {
    let requested = ''
    const result = await lookupRdap('navigo.help', async (input) => {
      requested = String(input)
      return Response.json({
        events: [
          { eventAction: 'registration', eventDate: '2025-11-01T10:00:00Z' },
          { eventAction: 'expiration', eventDate: '2026-11-01T10:00:00Z' },
        ],
        entities: [
          {
            roles: ['registrar'],
            vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'Namecheap']]],
          },
        ],
      })
    })

    expect(requested).toBe('https://rdap.org/domain/navigo.help')
    expect(result?.expiresAt?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(result?.registrar).toBe('Namecheap')
  })

  test('returns null when the TLD has no RDAP service and throws on other failures', async () => {
    expect(await lookupRdap('brofood.kz', async () => new Response('', { status: 404 }))).toBeNull()
    expect(lookupRdap('x.help', async () => new Response('', { status: 503 }))).rejects.toThrow('RDAP HTTP 503')
  })
})

describe('renewalState', () => {
  test('uses a 30-day warning window', () => {
    const now = new Date('2026-09-29T12:00:00Z')
    expect(renewalState(null, now)).toEqual({ state: 'UNKNOWN', daysLeft: null })
    expect(renewalState(new Date('2026-10-29T00:00:00Z'), now)).toEqual({ state: 'DUE_SOON', daysLeft: 30 })
    expect(renewalState(new Date('2026-10-30T00:00:00Z'), now)).toEqual({ state: 'OK', daysLeft: 31 })
    expect(renewalState(new Date('2026-09-28T00:00:00Z'), now)).toEqual({ state: 'OVERDUE', daysLeft: -1 })
  })
})

import { z } from 'zod'

// Contracts own validation messages for every consumer; the product UI is Russian.
z.config(z.locales.ru())

export * from './analytics'
export * from './auth'
export * from './clients'
export * from './common'
export * from './dashboard'
export * from './domains'
export * from './errors'
export * from './invoices'
export * from './journal'
export * from './projects'
export * from './servers'
export * from './tags'

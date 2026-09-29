import { Prisma } from '../generated/prisma/client'
import { AppError } from './errors'

type ErrorMessages = {
  notFound: string
  /** Used when a referenced row (client, server, project) does not exist. */
  relation?: string
  /** Used when a delete is blocked by dependent rows; implies the operation is a delete. */
  restricted?: string
}

// PostgreSQL SQLSTATE codes surfaced by the driver adapter for constraint failures.
const foreignKeyCodes = new Set(['23503', '23001'])
const uniqueCode = '23505'

/** Maps Prisma lookup errors and PostgreSQL constraint failures to stable API errors; rethrows everything else. */
export function mapPrismaError(error: unknown, messages: ErrorMessages): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      throw new AppError(404, 'NOT_FOUND', messages.notFound)
    }
    if (error.code === 'P2003') {
      throw foreignKeyError(messages)
    }
    if (error.code === 'P2002') {
      throw new AppError(409, 'CONFLICT', 'Такая запись уже существует')
    }
  }

  const sqlState = driverSqlState(error)
  if (sqlState && foreignKeyCodes.has(sqlState)) {
    throw foreignKeyError(messages)
  }
  if (sqlState === uniqueCode) {
    throw new AppError(409, 'CONFLICT', 'Такая запись уже существует')
  }

  throw error
}

function foreignKeyError(messages: ErrorMessages) {
  if (messages.restricted) {
    return new AppError(409, 'CONFLICT', messages.restricted)
  }
  return new AppError(400, 'BAD_REQUEST', messages.relation ?? 'Связанная запись не найдена')
}

function driverSqlState(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError') return undefined
  const cause = error.cause as { code?: unknown } | undefined
  return typeof cause?.code === 'string' ? cause.code : undefined
}

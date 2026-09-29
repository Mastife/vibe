import { apiErrorSchema } from '@projects-hq/contracts'
import type { z } from 'zod'

export function jsonContent<TSchema extends z.ZodType>(schema: TSchema) {
  return {
    'application/json': {
      schema,
    },
  }
}

export function jsonBody<TSchema extends z.ZodType>(schema: TSchema) {
  return {
    content: jsonContent(schema),
  }
}

export function jsonResponse<TSchema extends z.ZodType>(schema: TSchema, description: string) {
  return {
    content: jsonContent(schema),
    description,
  }
}

export function errorResponse(description: string) {
  return jsonResponse(apiErrorSchema, description)
}

export const unauthorizedResponse = errorResponse('Access token is missing, invalid, or expired')
export const notFoundResponse = errorResponse('Entity not found')
export const validationResponse = errorResponse('Invalid payload')

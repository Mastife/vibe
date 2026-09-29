import { z } from 'zod'

export const tagNameSchema = z.string().trim().min(1).max(32)

export const tagSchema = z.object({
  name: z.string(),
  /** How many projects carry the tag. */
  count: z.number().int(),
})

export const tagListResponseSchema = z.object({
  tags: z.array(tagSchema),
})

export const tagParamSchema = z.object({ name: tagNameSchema })

export const tagRenameSchema = z.object({ name: tagNameSchema })

export const tagMutationResponseSchema = z.object({
  /** Projects whose tag list changed. */
  updated: z.number().int(),
})

export type TagDto = z.infer<typeof tagSchema>
export type TagListResponse = z.infer<typeof tagListResponseSchema>
export type TagRenamePayload = z.infer<typeof tagRenameSchema>
export type TagMutationResponse = z.infer<typeof tagMutationResponseSchema>

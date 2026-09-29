/** Minimal fetch shape so tests can pass plain async stubs without Bun's extra `preconnect` member. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

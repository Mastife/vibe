import { createContext } from 'react'
import type { LoginRequest, RegisterRequest, UserDto } from '@projects-hq/contracts'

import type { ApiClient } from './api'

export type AuthContextValue = {
  /** Session-aware API client; refreshes tokens transparently. */
  api: ApiClient
  user: UserDto | null
  isBootstrapping: boolean
  isAuthenticated: boolean
  register: (input: RegisterRequest) => Promise<void>
  login: (input: LoginRequest) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

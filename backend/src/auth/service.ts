import type {
  LoginRequest,
  RegisterPayload,
  UserDto,
} from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { AppEnv } from '../env'
import { AppError } from '../http/errors'
import { Prisma } from '../generated/prisma/client'
import { signAccessToken, verifyAccessToken } from './access-tokens'
import { hashPassword, verifyPassword } from './passwords'
import { createRefreshToken, hashRefreshToken } from './refresh-tokens'

type SessionMetadata = {
  userAgent?: string
  ipAddress?: string
}

type UserRecord = {
  id: string
  email: string
  displayName: string | null
  createdAt: Date
}

export class AuthService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv,
  ) {}

  /** The first account is always allowed; later ones only through ADMIN_EMAILS. */
  async registrationStatus() {
    const userCount = await this.db.user.count()
    return {
      registrationOpen: userCount === 0 || this.env.ADMIN_EMAILS.length > 0,
      firstRun: userCount === 0,
    }
  }

  async register(input: RegisterPayload, metadata: SessionMetadata) {
    if (!(await this.isRegistrationOpenFor(input.email))) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Регистрация закрыта: панель уже настроена. Войдите под существующим аккаунтом.',
      )
    }

    const existingUser = await this.db.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    })

    if (existingUser) {
      throw new AppError(409, 'CONFLICT', 'Пользователь с таким email уже существует')
    }

    const passwordHash = await hashPassword(input.password)

    const user = await this.db.user
      .create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new AppError(409, 'CONFLICT', 'Пользователь с таким email уже существует')
        }

        throw error
      })

    return this.issueSession(user, metadata)
  }

  async login(input: LoginRequest, metadata: SessionMetadata) {
    const user = await this.db.user.findUnique({
      where: { email: input.email },
    })

    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Неверный email или пароль')
    }

    const passwordMatches = await verifyPassword(input.password, user.passwordHash)
    if (!passwordMatches) {
      throw new AppError(401, 'UNAUTHORIZED', 'Неверный email или пароль')
    }

    return this.issueSession(user, metadata)
  }

  async refresh(refreshToken: string | undefined, metadata: SessionMetadata) {
    if (!refreshToken) {
      throw new AppError(401, 'UNAUTHORIZED', 'Нет refresh-токена')
    }

    const refreshTokenHash = hashRefreshToken(refreshToken)
    const now = new Date()
    const currentSession = await this.db.authSession.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        user: true,
      },
    })

    if (!currentSession) {
      throw new AppError(401, 'UNAUTHORIZED', 'Сессия недействительна или истекла')
    }

    const nextRefreshToken = createRefreshToken()
    const nextRefreshTokenHash = hashRefreshToken(nextRefreshToken)
    const expiresAt = this.refreshExpiresAt()

    const nextSession = await this.db.$transaction(async (tx) => {
      const revokeResult = await tx.authSession.updateMany({
        where: {
          id: currentSession.id,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: { revokedAt: now },
      })

      if (revokeResult.count !== 1) {
        throw new AppError(401, 'UNAUTHORIZED', 'Сессия недействительна или истекла')
      }

      return tx.authSession.create({
        data: {
          userId: currentSession.userId,
          refreshTokenHash: nextRefreshTokenHash,
          expiresAt,
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
        },
      })
    })

    const accessToken = await signAccessToken(
      {
        sub: currentSession.user.id,
        email: currentSession.user.email,
        sessionId: nextSession.id,
      },
      this.env,
    )

    return {
      accessToken,
      refreshToken: nextRefreshToken,
    }
  }

  async getMe(accessToken: string | undefined) {
    if (!accessToken) {
      throw new AppError(401, 'UNAUTHORIZED', 'Требуется вход в систему')
    }

    const payload = await verifyAccessToken(accessToken, this.env).catch(() => {
      throw new AppError(401, 'UNAUTHORIZED', 'Токен доступа недействителен или истёк')
    })

    const session = await this.db.authSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    })

    if (!session) {
      throw new AppError(401, 'UNAUTHORIZED', 'Сессия недействительна или истекла')
    }

    return {
      user: toUserDto(session.user),
    }
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return

    await this.db.authSession.updateMany({
      where: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    })
  }

  private async isRegistrationOpenFor(email: string) {
    if (this.env.ADMIN_EMAILS.includes(email)) return true
    return (await this.db.user.count()) === 0
  }

  private async issueSession(user: UserRecord, metadata: SessionMetadata) {
    const refreshToken = createRefreshToken()
    const session = await this.db.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: this.refreshExpiresAt(),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    })

    const accessToken = await signAccessToken(
      {
        sub: user.id,
        email: user.email,
        sessionId: session.id,
      },
      this.env,
    )

    return {
      user: toUserDto(user),
      accessToken,
      refreshToken,
    }
  }

  private refreshExpiresAt() {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  }
}

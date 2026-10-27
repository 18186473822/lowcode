/**
 * 认证接口（方案 8.3）：
 *   POST /api/v1/auth/login   登录（失败落安全审计）
 *   GET  /api/v1/auth/me      当前登录态（需令牌，用于自检）
 *
 * 登录失败审计：用户不存在 / 口令错误 / 账号禁用统一为 `INVALID_CREDENTIALS`，
 * 对外不区分（防用户名枚举），但审计里记录**尝试的用户名**、IP 与 UA，
 * 便于发现撞库与口令爆破。中间件会跳过登录 401，避免重复记录。
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import { AuditService } from '../audit/audit.service.js'
import { AuthService } from './auth.service.js'

interface LoginBody {
  username?: unknown
  password?: unknown
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginBody, @Req() req: AuthedRequest) {
    const { username, password } = body ?? {}
    if (
      typeof username !== 'string' ||
      !username.trim() ||
      typeof password !== 'string' ||
      !password
    ) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'username 与 password 必须为非空字符串',
      })
    }

    const name = username.trim()
    try {
      return await this.auth.login(name, password)
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.audit.record({
          type: 'login_failed',
          username: name,
          ip: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
          method: 'POST',
          path: '/api/v1/auth/login',
          status: 401,
          code: 'INVALID_CREDENTIALS',
          ...(readUserAgent(req) ? { userAgent: readUserAgent(req) } : {}),
        })
      }
      throw error
    }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    return { user: req.user }
  }
}

function readUserAgent(req: AuthedRequest): string | undefined {
  const raw = req.headers['user-agent']
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw[0]
  return undefined
}

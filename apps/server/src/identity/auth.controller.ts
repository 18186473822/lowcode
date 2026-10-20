/**
 * 认证接口（方案 8.3）：
 *   POST /api/v1/auth/login   登录
 *   GET  /api/v1/auth/me      当前登录态（需令牌，用于自检）
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
  UseGuards,
} from '@nestjs/common'
import { AuthGuard, type AuthedRequest } from '../common/auth.guard.js'
import { AuthService } from './auth.service.js'

interface LoginBody {
  username?: unknown
  password?: unknown
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginBody) {
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
    return this.auth.login(username.trim(), password)
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    return { user: req.user }
  }
}

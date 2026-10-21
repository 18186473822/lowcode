/**
 * 页面模块：Schema 存取 + 静态校验 + 发布 / 回滚。
 * 引入 IdentityModule（AuthGuard 依赖的 JwtService 经 AuthModule 传递）；
 * 引入 RbacModule（批 6：GET schema 页面可见性守卫、bootstrap 过滤）；
 * 数据根目录 DATA_DIR 与 PAGE_REPOSITORY 由全局 StorageModule 提供（JSON / MySQL 二选一）。
 */
import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { AppController } from './app.controller.js'
import { AppConfigService } from './app-config.service.js'
import { PageController } from './page.controller.js'
import { PageService } from './page.service.js'

@Module({
  imports: [IdentityModule, RbacModule],
  controllers: [PageController, AppController],
  providers: [PageService, AppConfigService],
})
export class PageModule {}

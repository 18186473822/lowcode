/**
 * 页面模块：Schema 存取 + 静态校验 + 发布 / 回滚。
 * 引入 IdentityModule（AuthGuard 依赖的 JwtService 经 AuthModule 传递）；
 * 引入 RbacModule（批 6：GET schema 页面可见性守卫、bootstrap 过滤）；
 * 数据根目录 DATA_DIR 由全局 StorageModule 提供（不再在本模块重复 provider）。
 */
import { Module } from '@nestjs/common'
import { IdentityModule } from '../identity/identity.module.js'
import { RbacModule } from '../rbac/rbac.module.js'
import { AppController } from './app.controller.js'
import { AppConfigService } from './app-config.service.js'
import { PageController } from './page.controller.js'
import { PageService } from './page.service.js'
import { FilePageRepository } from './file-page.repository.js'
import { PAGE_REPOSITORY } from './page.types.js'

@Module({
  imports: [IdentityModule, RbacModule],
  controllers: [PageController, AppController],
  providers: [
    PageService,
    AppConfigService,
    { provide: PAGE_REPOSITORY, useClass: FilePageRepository },
  ],
})
export class PageModule {}

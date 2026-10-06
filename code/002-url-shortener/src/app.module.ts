import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ObservabilityModule } from './observability/observability.module';
import { SystemModule } from './system/system.module';
import { UrlsModule } from './urls/urls.module';

@Module({
  imports: [DatabaseModule, ObservabilityModule, SystemModule, UrlsModule],
})
export class AppModule {}

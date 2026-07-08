import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UrlsModule } from './urls/urls.module';

@Module({
  imports: [DatabaseModule, UrlsModule],
})
export class AppModule {}

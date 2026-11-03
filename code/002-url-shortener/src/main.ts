import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

config({ override: true });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  const server = app.getHttpServer();

  // Keep the application-side idle timeout longer than the proxy's upstream
  // connection reuse window. This prevents Nginx from racing with Node while
  // reusing a socket that Node has already closed.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  await app.listen(port);
}

void bootstrap();

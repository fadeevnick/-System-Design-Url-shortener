import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: async () => {
        const pool = new Pool({
          connectionString:
            process.env.DATABASE_URL ??
            'postgres://url_shortener:url_shortener@localhost:5432/url_shortener',
        });

        await pool.query(`
          CREATE TABLE IF NOT EXISTS urls (
            id BIGSERIAL PRIMARY KEY,
            short_code TEXT UNIQUE,
            long_url TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS urls_short_code_idx
          ON urls (short_code);
        `);

        return pool;
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}

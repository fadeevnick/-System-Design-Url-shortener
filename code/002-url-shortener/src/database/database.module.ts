import { Global, Module } from '@nestjs/common';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: async () => {
        const connectionString = await resolveConnectionString();
        const pool = new Pool({
          connectionString,
          max: Number(process.env.PG_POOL_MAX ?? 10),
          ssl: {
            rejectUnauthorized: false,
          },
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

type DatabaseSecret = {
  connectionString?: string;
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  dbname?: string;
  database?: string;
};

async function resolveConnectionString(): Promise<string> {
  const secretArn = process.env.DATABASE_SECRET_ARN;
  if (secretArn) {
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );

    if (!response.SecretString) {
      throw new Error(`Database secret ${secretArn} has no SecretString`);
    }

    return parseDatabaseSecret(response.SecretString);
  }

  return (
    process.env.DATABASE_URL ??
    'postgres://url_shortener:url_shortener@localhost:5432/url_shortener'
  );
}

function parseDatabaseSecret(secretString: string): string {
  const secret = JSON.parse(secretString) as DatabaseSecret;

  if (secret.connectionString) {
    return secret.connectionString;
  }

  const database = secret.database ?? secret.dbname;
  if (!secret.host || !secret.username || !secret.password || !database) {
    throw new Error(
      'Database secret must contain connectionString or host, username, password, and database/dbname',
    );
  }

  const port = Number(secret.port ?? 5432);
  const username = encodeURIComponent(secret.username);
  const password = encodeURIComponent(secret.password);
  const databaseName = encodeURIComponent(database);

  return `postgres://${username}:${password}@${secret.host}:${port}/${databaseName}`;
}

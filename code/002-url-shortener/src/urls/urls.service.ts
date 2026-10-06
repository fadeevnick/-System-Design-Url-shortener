import { BadRequestException, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { MetricsService } from '../observability/metrics.service';
import { encodeBase62 } from './base62';

type InsertUrlRow = {
  id: string;
};

type ResolveUrlRow = {
  long_url: string;
};

@Injectable()
export class UrlsService implements OnModuleDestroy {
  private readonly baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly metricsService: MetricsService,
  ) {}

  async create(longUrl: string) {
    this.assertValidUrl(longUrl);

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const insertResult = await client.query<InsertUrlRow>(
        'INSERT INTO urls (long_url) VALUES ($1) RETURNING id',
        [longUrl],
      );
      this.metricsService.increment('db_write_total', { operation: 'insert_url' });

      const id = Number(insertResult.rows[0]?.id);
      const shortCode = encodeBase62(id);

      await client.query('UPDATE urls SET short_code = $1 WHERE id = $2', [shortCode, id]);
      this.metricsService.increment('db_write_total', { operation: 'update_short_code' });
      await client.query('COMMIT');

      return {
        shortCode,
        shortUrl: `${this.baseUrl}/${shortCode}`,
        longUrl,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resolve(shortCode: string): Promise<string | null> {
    const result = await this.pool.query<ResolveUrlRow>(
      'SELECT long_url FROM urls WHERE short_code = $1',
      [shortCode],
    );
    this.metricsService.increment('db_read_total', { operation: 'resolve_short_code' });

    return result.rows[0]?.long_url ?? null;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private assertValidUrl(value: string) {
    try {
      const url = new URL(value);

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('unsupported protocol');
      }
    } catch {
      throw new BadRequestException('longUrl must be a valid http or https URL');
    }
  }
}

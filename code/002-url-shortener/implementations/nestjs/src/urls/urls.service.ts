import { BadRequestException, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
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

    const client = await this.connectWithMetrics('create_short_url');

    try {
      await this.queryWithMetrics(client, 'BEGIN', [], 'begin_create_short_url');

      const insertResult = await this.queryWithMetrics<InsertUrlRow>(
        client,
        'INSERT INTO urls (long_url) VALUES ($1) RETURNING id',
        [longUrl],
        'insert_url',
      );
      this.metricsService.increment('db_write_total', { operation: 'insert_url' });

      const id = Number(insertResult.rows[0]?.id);
      const shortCode = encodeBase62(id);

      await this.queryWithMetrics(
        client,
        'UPDATE urls SET short_code = $1 WHERE id = $2',
        [shortCode, id],
        'update_short_code',
      );
      this.metricsService.increment('db_write_total', { operation: 'update_short_code' });
      await this.queryWithMetrics(client, 'COMMIT', [], 'commit_create_short_url');

      return {
        shortCode,
        shortUrl: `${this.baseUrl}/${shortCode}`,
        longUrl,
      };
    } catch (error) {
      await this.queryWithMetrics(client, 'ROLLBACK', [], 'rollback_create_short_url');
      throw error;
    } finally {
      client.release();
      this.recordPoolSnapshot();
    }
  }

  async resolve(shortCode: string): Promise<string | null> {
    const client = await this.connectWithMetrics('resolve_short_code');

    try {
      const result = await this.queryWithMetrics<ResolveUrlRow>(
        client,
        'SELECT long_url FROM urls WHERE short_code = $1',
        [shortCode],
        'resolve_short_code',
      );
      this.metricsService.increment('db_read_total', { operation: 'resolve_short_code' });

      return result.rows[0]?.long_url ?? null;
    } finally {
      client.release();
      this.recordPoolSnapshot();
    }
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

  private async connectWithMetrics(operation: string): Promise<PoolClient> {
    this.recordPoolSnapshot();

    const startedAt = Date.now();
    const client = await this.pool.connect();

    this.metricsService.observeMs('db_pool_wait_duration', Date.now() - startedAt, { operation });
    this.recordPoolSnapshot();

    return client;
  }

  private async queryWithMetrics<T extends QueryResultRow>(
    client: PoolClient,
    text: string,
    values: unknown[],
    operation: string,
  ) {
    const startedAt = Date.now();

    try {
      return await client.query<T>(text, values);
    } finally {
      this.metricsService.observeMs('db_query_duration', Date.now() - startedAt, { operation });
    }
  }

  private recordPoolSnapshot() {
    const totalCount = this.pool.totalCount;
    const idleCount = this.pool.idleCount;
    const waitingCount = this.pool.waitingCount;
    const activeCount = totalCount - idleCount;
    const configuredMax = Number(this.pool.options.max ?? 10);

    this.metricsService.setGauge('db_pool_max_configured', configuredMax);
    this.metricsService.setGauge('db_pool_total_count', totalCount);
    this.metricsService.setGauge('db_pool_idle_count', idleCount);
    this.metricsService.setGauge('db_pool_active_count', activeCount);
    this.metricsService.setGauge('db_pool_waiting_count', waitingCount);
    this.metricsService.setMaxGauge('db_pool_total_count_max_observed', totalCount);
    this.metricsService.setMaxGauge('db_pool_active_count_max_observed', activeCount);
    this.metricsService.setMaxGauge('db_pool_waiting_count_max_observed', waitingCount);
  }
}

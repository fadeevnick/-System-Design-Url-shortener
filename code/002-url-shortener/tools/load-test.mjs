const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const scenario = process.argv[2] ?? 'hot-read';
const requests = Number(process.env.REQUESTS ?? process.argv[3] ?? 1000);
const concurrency = Number(process.env.CONCURRENCY ?? process.argv[4] ?? 20);
const durationSeconds = Number(process.env.DURATION_SECONDS ?? 30);
const stepSeconds = Number(process.env.STEP_SECONDS ?? 20);
const targetP95Ms = Number(process.env.TARGET_P95_MS ?? 100);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 10000);
const concurrencySteps = (process.env.CONCURRENCY_STEPS ?? '10,25,50,100,200')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);

const sampleLongUrl =
  'https://shop.example.com/orders/923847293847?token=abc&utm_source=sms&utm_campaign=pickup_ready';

async function main() {
  await assertHealthy();

  if (scenario === 'capacity-step') {
    const shortCode = await seedShortCode();
    const results = [];

    for (const stepConcurrency of concurrencySteps) {
      const metricsBefore = await fetchMetrics();
      const result = await runDuration({
        durationMs: stepSeconds * 1000,
        concurrency: stepConcurrency,
        task: () => followRedirect(shortCode),
      });
      const metricsAfter = await fetchMetrics();
      const summary = summarize({
        scenario,
        concurrency: stepConcurrency,
        result,
        metricsBefore,
        metricsAfter,
      });

      results.push(summary);
      printSummary(summary);

      if (summary.errorRatePct > 1 || summary.p95Ms > targetP95Ms) {
        console.log(
          `\nStop condition reached: p95>${targetP95Ms}ms or errorRate>1%. This is the first pressure point to investigate.\n`,
        );
        break;
      }
    }

    printCapacityTable(results);
    return;
  }

  const metricsBefore = await fetchMetrics();
  const startedAt = Date.now();
  let result;

  if (scenario === 'write-burst') {
    result = await runCount({
      total: requests,
      concurrency,
      task: (index) => createShortUrl(`${sampleLongUrl}&request=${Date.now()}-${index}`),
    });
  } else if (scenario === 'hot-read') {
    const shortCode = await seedShortCode();
    result = await runCount({
      total: requests,
      concurrency,
      task: () => followRedirect(shortCode),
    });
  } else if (scenario === 'campaign-spike') {
    const shortCode = await seedShortCode();
    result = await runDuration({
      durationMs: durationSeconds * 1000,
      concurrency,
      task: () => followRedirect(shortCode),
    });
  } else if (scenario === 'mixed') {
    const shortCode = await seedShortCode();
    result = await runCount({
      total: requests,
      concurrency,
      task: (index) => {
        if (index % 100 === 0) {
          return createShortUrl(`${sampleLongUrl}&request=${Date.now()}-${index}`);
        }

        return followRedirect(shortCode);
      },
    });
  } else {
    throw new Error(
      `Unknown scenario "${scenario}". Use hot-read, write-burst, mixed, campaign-spike, or capacity-step.`,
    );
  }

  const metricsAfter = await fetchMetrics();
  const summary = summarize({
    scenario,
    concurrency,
    result,
    metricsBefore,
    metricsAfter,
    wallMs: Date.now() - startedAt,
  });

  printSummary(summary);
}

async function assertHealthy() {
  const response = await fetchWithTimeout(`${baseUrl}/health`);

  if (!response.ok) {
    throw new Error(`GET /health failed: ${response.status} ${await response.text()}`);
  }
}

async function seedShortCode() {
  const response = await createShortUrl(sampleLongUrl);
  return response.shortCode;
}

async function createShortUrl(longUrl) {
  const response = await fetchWithTimeout(`${baseUrl}/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ longUrl }),
  });

  if (!response.ok) {
    throw new Error(`POST /shorten failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function followRedirect(shortCode) {
  const response = await fetchWithTimeout(`${baseUrl}/${shortCode}`, {
    redirect: 'manual',
  });

  if (response.status !== 302) {
    throw new Error(`GET /${shortCode} expected 302, got ${response.status}`);
  }
}

async function fetchMetrics() {
  const response = await fetchWithTimeout(`${baseUrl}/metrics`);

  if (!response.ok) {
    throw new Error(`GET /metrics failed: ${response.status} ${await response.text()}`);
  }

  return parseMetrics(await response.text());
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runCount({ total, concurrency, task }) {
  let next = 0;
  const latencies = [];
  const errors = [];
  const startedAt = Date.now();

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        const index = next;
        next += 1;
        await runOne({ index, task, latencies, errors });
      }
    }),
  );

  return {
    attempted: total,
    ok: latencies.length,
    errors: errors.length,
    latencies,
    durationMs: Date.now() - startedAt,
    sampleErrors: errors.slice(0, 3),
  };
}

async function runDuration({ durationMs, concurrency, task }) {
  let next = 0;
  const latencies = [];
  const errors = [];
  const startedAt = Date.now();
  const stopAt = startedAt + durationMs;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < stopAt) {
        const index = next;
        next += 1;
        await runOne({ index, task, latencies, errors });
      }
    }),
  );

  return {
    attempted: next,
    ok: latencies.length,
    errors: errors.length,
    latencies,
    durationMs: Date.now() - startedAt,
    sampleErrors: errors.slice(0, 3),
  };
}

async function runOne({ index, task, latencies, errors }) {
  const startedAt = Date.now();

  try {
    await task(index);
    latencies.push(Date.now() - startedAt);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function parseMetrics(text) {
  const metrics = new Map();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const lastSpace = trimmed.lastIndexOf(' ');

    if (lastSpace === -1) {
      continue;
    }

    metrics.set(trimmed.slice(0, lastSpace), Number(trimmed.slice(lastSpace + 1)));
  }

  return metrics;
}

function metricDelta(before, after, name) {
  return (after.get(name) ?? 0) - (before.get(name) ?? 0);
}

function metricValue(metrics, name) {
  return metrics.get(name) ?? 0;
}

function timerDelta(before, after, name) {
  const count = metricDelta(before, after, `${name}_count`);
  const sumMs = metricDelta(before, after, `${name}_sum_ms`);

  return {
    count,
    avgMs: count > 0 ? round(sumMs / count, 1) : 0,
    maxMsCumulative: metricValue(after, `${name}_max_ms`),
  };
}

function summarize({ scenario, concurrency, result, metricsBefore, metricsAfter, wallMs }) {
  const ok = result.ok;
  const attempted = result.attempted;
  const durationMs = wallMs ?? result.durationMs;
  const sorted = [...result.latencies].sort((left, right) => left - right);
  const dbReadDelta = metricDelta(
    metricsBefore,
    metricsAfter,
    'db_read_total{operation="resolve_short_code"}',
  );
  const dbInsertDelta = metricDelta(
    metricsBefore,
    metricsAfter,
    'db_write_total{operation="insert_url"}',
  );
  const dbUpdateDelta = metricDelta(
    metricsBefore,
    metricsAfter,
    'db_write_total{operation="update_short_code"}',
  );
  const estimatedMonthlyDbReads = Math.round(
    (dbReadDelta * 30 * 24 * 60 * 60) / (durationMs / 1000),
  );
  const poolWait = timerDelta(
    metricsBefore,
    metricsAfter,
    'db_pool_wait_duration{operation="resolve_short_code"}',
  );
  const dbQuery = timerDelta(
    metricsBefore,
    metricsAfter,
    'db_query_duration{operation="resolve_short_code"}',
  );

  return {
    baseUrl,
    scenario,
    concurrency,
    attempted,
    ok,
    errors: result.errors,
    errorRatePct: round((result.errors / Math.max(attempted, 1)) * 100, 2),
    durationMs,
    rps: round((ok / durationMs) * 1000, 1),
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted.at(-1) ?? 0,
    dbReadDelta,
    dbInsertDelta,
    dbUpdateDelta,
    dbReadsPerSuccessfulRequest: round(dbReadDelta / Math.max(ok, 1), 3),
    estimatedMonthlyDbReads,
    bottleneckDiagnostics: {
      poolWaitAvgMs: poolWait.avgMs,
      poolWaitMaxMsCumulative: poolWait.maxMsCumulative,
      dbQueryAvgMs: dbQuery.avgMs,
      dbQueryMaxMsCumulative: dbQuery.maxMsCumulative,
      poolMaxConfigured: metricValue(metricsAfter, 'db_pool_max_configured'),
      poolTotalCount: metricValue(metricsAfter, 'db_pool_total_count'),
      poolIdleCount: metricValue(metricsAfter, 'db_pool_idle_count'),
      poolActiveCount: metricValue(metricsAfter, 'db_pool_active_count'),
      poolWaitingCount: metricValue(metricsAfter, 'db_pool_waiting_count'),
      poolTotalMaxObserved: metricValue(metricsAfter, 'db_pool_total_count_max_observed'),
      poolActiveMaxObserved: metricValue(metricsAfter, 'db_pool_active_count_max_observed'),
      poolWaitingMaxObserved: metricValue(metricsAfter, 'db_pool_waiting_count_max_observed'),
    },
    cacheThoughtExperiment: {
      hotReadDbReadsWithBaseline: dbReadDelta,
      hotReadDbReadsWithIdealCache: dbReadDelta > 0 ? 1 : 0,
      avoidableDbReads: Math.max(dbReadDelta - 1, 0),
    },
    sampleErrors: result.sampleErrors,
    metrics: `${baseUrl}/metrics`,
  };
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

function round(value, decimals) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function printSummary(summary) {
  console.log(JSON.stringify(summary, null, 2));

  if (summary.dbReadsPerSuccessfulRequest >= 0.9 && summary.scenario !== 'write-burst') {
    console.log(
      '\nInterpretation: redirect traffic is coupled to PostgreSQL reads almost 1:1. Cache-aside is useful when this repeated read load is large enough to affect latency, DB tier, or cost.\n',
    );
  }

  if (summary.p95Ms <= targetP95Ms && summary.errorRatePct === 0) {
    console.log(
      `Decision: no latency crisis at this load. Do not add Redis just because the test passed; increase load or use production traffic numbers.\n`,
    );
  } else {
    console.log(
      `Decision: p95/error rate crossed the target. Now investigate whether vertical scaling, read replicas, or Redis is the cheapest fix.\n`,
    );
  }
}

function printCapacityTable(results) {
  console.log('capacity-step summary');
  console.table(
    results.map((result) => ({
      concurrency: result.concurrency,
      rps: result.rps,
      p95Ms: result.p95Ms,
      p99Ms: result.p99Ms,
      errorRatePct: result.errorRatePct,
      poolWaitAvgMs: result.bottleneckDiagnostics.poolWaitAvgMs,
      dbQueryAvgMs: result.bottleneckDiagnostics.dbQueryAvgMs,
      poolActiveMax: result.bottleneckDiagnostics.poolActiveMaxObserved,
      poolWaitingMax: result.bottleneckDiagnostics.poolWaitingMaxObserved,
      dbReadDelta: result.dbReadDelta,
      dbReadsPerRequest: result.dbReadsPerSuccessfulRequest,
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

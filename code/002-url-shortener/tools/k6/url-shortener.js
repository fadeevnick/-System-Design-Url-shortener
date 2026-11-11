import http from 'k6/http';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const requestedWorkload = __ENV.WORKLOAD || 'hot-read';
const workload = requestedWorkload === 'campaign-spike' ? 'hot-read' : requestedWorkload;
const rate = Number(__ENV.RATE || 1000);
const duration = __ENV.DURATION || '2m';
const targetP95Ms = Number(__ENV.TARGET_P95_MS || 300);
const maxErrorRate = Number(__ENV.MAX_ERROR_RATE || 0.01);
const preAllocatedVus = Number(__ENV.PRE_ALLOCATED_VUS || 200);
const maxVus = Number(__ENV.MAX_VUS || 1000);
const setupTimeout = __ENV.SETUP_TIMEOUT || '10m';
const seedUrlCount = Number(__ENV.SEED_URL_COUNT || 1000);
const writePercent = Number(__ENV.WRITE_PERCENT || 1);
const maxDroppedIterations = Number(__ENV.MAX_DROPPED_ITERATIONS || 1);
const enforceDroppedIterations = (__ENV.ENFORCE_DROPPED_ITERATIONS || 'false') === 'true';

const sampleLongUrl =
  'https://shop.example.com/orders/923847293847?token=abc&utm_source=sms&utm_campaign=pickup_ready';

const thresholds = {
  'http_req_failed{phase:workload}': [`rate<${maxErrorRate}`],
  'http_req_duration{phase:workload}': [`p(95)<${targetP95Ms}`],
};

if (enforceDroppedIterations) {
  thresholds.dropped_iterations = [`count<${maxDroppedIterations}`];
}

export const options = {
  setupTimeout,
  scenarios: {
    url_shortener: {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration,
      preAllocatedVUs: preAllocatedVus,
      maxVUs: maxVus,
    },
  },
  thresholds,
};

export function setup() {
  const health = http.get(`${baseUrl}/health`, { tags: { endpoint: 'health' } });

  if (health.status !== 200) {
    throw new Error(`GET /health failed: ${health.status} ${health.body}`);
  }

  if (workload === 'write-burst') {
    return { shortCodes: [] };
  }

  const seedCount = workload === 'cold-read' ? seedUrlCount : 1;
  const shortCodes = [];

  for (let index = 0; index < seedCount; index += 1) {
    shortCodes.push(createShortUrl(`${sampleLongUrl}&seed=${Date.now()}-${index}`, 'setup'));
  }

  return { shortCodes };
}

export default function (data) {
  if (workload === 'write-burst') {
    createShortUrl(`${sampleLongUrl}&request=${Date.now()}-${__ITER}`);
    return;
  }

  if (workload === 'mixed' && Math.random() * 100 < writePercent) {
    createShortUrl(`${sampleLongUrl}&mixed=${Date.now()}-${__ITER}`);
    return;
  }

  const shortCode = pickShortCode(data.shortCodes);
  followRedirect(shortCode);
}

function createShortUrl(longUrl, phase = 'workload') {
  const response = http.post(
    `${baseUrl}/shorten`,
    JSON.stringify({ longUrl }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: {
        name: 'POST /shorten',
        endpoint: 'shorten',
        workload: requestedWorkload,
        phase,
      },
    },
  );

  check(response, {
    'POST /shorten status is 201 or 200': (res) => res.status === 201 || res.status === 200,
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`POST /shorten failed: ${response.status} ${response.body}`);
  }

  return response.json('shortCode');
}

function followRedirect(shortCode) {
  const response = http.get(`${baseUrl}/${shortCode}`, {
    redirects: 0,
    tags: {
      name: 'GET /:shortCode',
      endpoint: 'redirect',
      workload: requestedWorkload,
      phase: 'workload',
    },
  });

  check(response, {
    'GET /:shortCode status is 302': (res) => res.status === 302,
  });
}

function pickShortCode(shortCodes) {
  if (!shortCodes || shortCodes.length === 0) {
    throw new Error('No short codes were seeded for read workload');
  }

  if (workload === 'cold-read') {
    return shortCodes[Math.floor(Math.random() * shortCodes.length)];
  }

  return shortCodes[0];
}

function durationToSeconds(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);

  if (!match) {
    throw new Error(`Unsupported DURATION format: ${value}`);
  }

  const amount = Number(match[1]);
  const multipliers = { ms: 0.001, s: 1, m: 60, h: 3600 };
  return amount * multipliers[match[2]];
}

export function handleSummary(data) {
  const workloadIterations = data.metrics.iterations.values.count || 0;
  const droppedIterations = data.metrics.dropped_iterations?.values.count || 0;
  const durationSeconds = durationToSeconds(duration);
  const workloadRate = workloadIterations / durationSeconds;
  const offeredRate = (workloadIterations + droppedIterations) / durationSeconds;
  const droppedRate = droppedIterations / (workloadIterations + droppedIterations);

  const workloadSummary = [
    '',
    'WORKLOAD SUMMARY',
    `workload_iterations: ${workloadIterations}`,
    `workload_rate: ${workloadRate.toFixed(2)} iterations/s`,
    `offered_rate: ${offeredRate.toFixed(2)} iterations/s`,
    `dropped_iterations: ${droppedIterations}`,
    `dropped_rate: ${(droppedRate * 100).toFixed(3)}%`,
    '',
  ].join('\n');

  return {
    stdout: `${textSummary(data, { indent: ' ', enableColors: true })}${workloadSummary}`,
  };
}

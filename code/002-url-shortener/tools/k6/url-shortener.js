import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const requestedWorkload = __ENV.WORKLOAD || 'hot-read';
const workload = requestedWorkload === 'campaign-spike' ? 'hot-read' : requestedWorkload;
const rate = Number(__ENV.RATE || 1000);
const duration = __ENV.DURATION || '2m';
const targetP95Ms = Number(__ENV.TARGET_P95_MS || 300);
const maxErrorRate = Number(__ENV.MAX_ERROR_RATE || 0.01);
const preAllocatedVus = Number(__ENV.PRE_ALLOCATED_VUS || 200);
const maxVus = Number(__ENV.MAX_VUS || 1000);
const seedUrlCount = Number(__ENV.SEED_URL_COUNT || 1000);
const writePercent = Number(__ENV.WRITE_PERCENT || 1);
const maxDroppedIterations = Number(__ENV.MAX_DROPPED_ITERATIONS || 1);

const sampleLongUrl =
  'https://shop.example.com/orders/923847293847?token=abc&utm_source=sms&utm_campaign=pickup_ready';

export const options = {
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
  thresholds: {
    http_req_failed: [`rate<${maxErrorRate}`],
    http_req_duration: [`p(95)<${targetP95Ms}`],
    dropped_iterations: [`count<${maxDroppedIterations}`],
  },
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
    shortCodes.push(createShortUrl(`${sampleLongUrl}&seed=${Date.now()}-${index}`));
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

function createShortUrl(longUrl) {
  const response = http.post(
    `${baseUrl}/shorten`,
    JSON.stringify({ longUrl }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'shorten', workload: requestedWorkload },
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
    tags: { endpoint: 'redirect', workload: requestedWorkload },
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

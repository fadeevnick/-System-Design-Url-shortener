const targets = (process.env.APP_PRIVATE_IPS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const token = process.env.METRICS_RESET_TOKEN;

if (targets.length === 0) {
  throw new Error('APP_PRIVATE_IPS is required, for example 172.31.22.192,172.31.34.79');
}

if (!token) {
  throw new Error('METRICS_RESET_TOKEN is required');
}

for (const ip of targets) {
  const response = await fetch(`http://${ip}:3000/metrics/reset`, {
    method: 'POST',
    headers: { 'x-metrics-reset-token': token },
  });

  if (!response.ok) {
    throw new Error(`${ip}: reset failed with HTTP ${response.status}`);
  }

  console.log(`${ip}: metrics reset`);
}

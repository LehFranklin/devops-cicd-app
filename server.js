const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = process.env.APP_VERSION || 'v1';

// FAIL_RATE lets us simulate a "bad deploy" later (0 = healthy, e.g. 0.5 = 50% of requests error)
// This is how we'll test that the pipeline catches and rolls back a broken release.
const FAIL_RATE = parseFloat(process.env.FAIL_RATE || '0');

// --- Prometheus metrics setup ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
  registers: [register],
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestCounter.inc({ route: req.path, status: res.statusCode });
    httpRequestDuration.observe({ route: req.path, status: res.statusCode }, durationSec);
  });
  next();
});

// --- Routes ---

// Liveness/readiness probe for Kubernetes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: VERSION });
});

// Main "business logic" route — randomly errors based on FAIL_RATE
// This simulates a bad deploy so we can later prove automated rollback works.
app.get('/', (req, res) => {
  if (Math.random() < FAIL_RATE) {
    return res.status(500).json({ error: 'simulated failure', version: VERSION });
  }
  res.status(200).json({ message: `Hello from ${VERSION}`, version: VERSION });
});

// Prometheus scrape endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Only start listening when run directly (e.g. `node server.js` or in the container).
// When required by tests, the caller controls the server lifecycle instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`App ${VERSION} listening on port ${PORT} (FAIL_RATE=${FAIL_RATE})`);
  });
}

module.exports = app;

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.FAIL_RATE = '0';
const app = require('../server.js');

const TEST_PORT = 3999;
let server;

before(() => {
  server = app.listen(TEST_PORT);
});

after(() => {
  server.close();
});

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });
}

test('GET /health returns 200 and status ok', async () => {
  const res = await get('/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
});

test('GET / returns 200 when FAIL_RATE is 0', async () => {
  const res = await get('/');
  assert.strictEqual(res.status, 200);
});

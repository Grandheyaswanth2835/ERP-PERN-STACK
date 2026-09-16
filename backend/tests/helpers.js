const app = require('../server');

let server;
let baseUrl;

function start(port = 0) {
  return new Promise((resolve, reject) => {
    server = app.listen(port, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve(baseUrl);
    });
    server.on('error', reject);
  });
}

function stop() {
  return new Promise((resolve) => server && server.close(resolve));
}

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(username, password) {
  const res = await api('POST', '/api/auth/login', { body: { username, password } });
  if (res.status !== 200) throw new Error(`Login failed for ${username}: ${JSON.stringify(res.data)}`);
  return { token: res.data.token, user: res.data.user };
}

module.exports = { start, stop, api, login };
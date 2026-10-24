import assert from 'node:assert/strict';
import test from 'node:test';
import { createCors } from '../src/cors.js';
import { HttpError } from '../src/errors.js';
import { preparePage } from '../src/proxy.js';
import { isPrivateAddress, normalizeUrl } from '../src/urls.js';

test('normalizeUrl adds https and keeps paths', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(
    normalizeUrl('http://example.com/a?b=1#c'),
    'http://example.com/a?b=1#c',
  );
});

test('normalizeUrl rejects unsafe schemes, credentials and garbage', () => {
  for (const value of ['javascript:alert(1)', 'ftp://example.com', 'https://user:pass@example.com', 'http://']) {
    assert.throws(
      () => normalizeUrl(value),
      (error) => error instanceof HttpError && error.status >= 400,
      value,
    );
  }
  assert.throws(() => normalizeUrl(''), HttpError);
});

test('private addresses are detected across IPv4 and IPv6', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.9',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    'fe80::1',
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }

  for (const address of ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888', '2606:4700:4700::1111']) {
    assert.equal(isPrivateAddress(address), false, address);
  }
});

test('preparePage strips hostile meta tags and adds a base and bridge', () => {
  const html = `<!doctype html><html><head><meta content="default-src 'none'" http-equiv="Content-Security-Policy"><base href="/sub/"><title>Hello</title></head><body><p>Hi</p></body></html>`;
  const prepared = preparePage(html, 'https://example.com/page');

  assert.match(prepared, /<base href="https:\/\/example\.com\/page">/);
  assert.match(prepared, /__DG_BRIDGE__/);
  assert.doesNotMatch(prepared, /Content-Security-Policy/i);
  assert.doesNotMatch(prepared, /<base href="\/sub\/">/);
  assert.match(prepared, /<title>Hello<\/title>/);
});

test('preparePage inserts into a document without a head', () => {
  const prepared = preparePage('<!doctype html><body>plain</body>', 'https://example.com/');
  assert.match(prepared, /^<!doctype html><base href=/);
  assert.match(prepared, /plain/);
});

function mockExchange(method, origin) {
  const headers = {};
  const req = { method, headers: origin ? { origin } : {} };
  const res = {
    statusCode: 0,
    ended: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
  return { req, res, headers };
}

test('createCors reflects configured origins on normal requests', () => {
  const cors = createCors(['https://dg-brows.vercel.app']);
  const { req, res, headers } = mockExchange('GET', 'https://dg-brows.vercel.app');
  let passedThrough = false;
  cors(req, res, () => {
    passedThrough = true;
  });

  assert.equal(passedThrough, true);
  assert.equal(res.statusCode, 0);
  assert.equal(headers['access-control-allow-origin'], 'https://dg-brows.vercel.app');
  assert.equal(headers['vary'], 'Origin');
});

test('createCors answers preflights without hitting the route', () => {
  const cors = createCors(['https://dg-brows.vercel.app']);
  const { req, res, headers } = mockExchange('OPTIONS', 'https://dg-brows.vercel.app');
  let passedThrough = false;
  cors(req, res, () => {
    passedThrough = true;
  });

  assert.equal(passedThrough, false);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.match(headers['access-control-allow-methods'], /GET/);
  assert.match(headers['access-control-allow-headers'], /Content-Type/);
});

test('createCors ignores unknown origins, wildcard mode and missing origins', () => {
  const strict = createCors(['https://dg-brows.vercel.app']);
  const stranger = mockExchange('GET', 'https://evil.example');
  strict(stranger.req, stranger.res, () => {});
  assert.equal(stranger.headers['access-control-allow-origin'], undefined);

  const wildcard = createCors(['*']);
  const anyone = mockExchange('GET', 'https://anything.example');
  wildcard(anyone.req, anyone.res, () => {});
  assert.equal(anyone.headers['access-control-allow-origin'], '*');

  const silent = mockExchange('GET', null);
  strict(silent.req, silent.res, () => {});
  assert.equal(silent.headers['access-control-allow-origin'], undefined);
});

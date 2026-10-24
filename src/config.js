function bool(value, fallback) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function int(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  host: process.env.HOST || '0.0.0.0',
  port: int(process.env.PORT, 3000),
  engineBin: process.env.LIGHTPANDA_BIN || process.env.DG_BROWS_ENGINE_BIN || 'lightpanda',
  allowPrivate: bool(process.env.DG_BROWS_ALLOW_PRIVATE, !isProduction),
  pageTimeoutMs: int(process.env.DG_BROWS_PAGE_TIMEOUT_MS, 30_000),
  readerTimeoutMs: int(process.env.DG_BROWS_READER_TIMEOUT_MS, 30_000),
  maxPageBytes: int(process.env.DG_BROWS_MAX_PAGE_BYTES, 4_500_000),
  maxReaderBytes: int(process.env.DG_BROWS_MAX_READER_BYTES, 2_000_000),
  userAgent:
    'DG Brows/1.0 (Lightpanda engine; +https://github.com/scriptsnsenses-sys/browser)',
  corsOrigins: (process.env.DG_BROWS_CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
};

import { describe, expect, test } from 'bun:test';
import {
  buildPoolRows,
  burnRatePerHour,
  maskAccountLabel,
  mergePoolSamples,
  readPoolLimit,
  type PoolAccount,
  type PoolSample,
} from '@/features/quota/pool/poolModel';

const HOUR = 3_600_000;

describe('pool quota model', () => {
  test('reads the longest claude window and converts used to remaining', () => {
    const limit = readPoolLimit('claude', {
      status: 'success',
      windows: [
        { id: 'five_hour', label: '5-hour limit', usedPercent: 40, resetAtMs: 1000, periodHours: 5 },
        { id: 'weekly', label: 'Weekly limit', usedPercent: 86, resetAtMs: 2000, periodHours: 168 },
      ],
    });
    expect(limit?.id).toBe('weekly');
    expect(limit?.remainingPercent).toBeCloseTo(14);
    expect(limit?.resetAtMs).toBe(2000);
  });

  test('reads the tightest antigravity bucket and parses its reset time', () => {
    const limit = readPoolLimit('antigravity', {
      status: 'success',
      groups: [
        {
          buckets: [
            { id: 'gemini', label: 'Gemini', remainingFraction: 0.7, resetTime: '2026-11-20T10:00:00Z' },
            { id: 'claude', label: 'Claude', remainingFraction: 0.0, resetTime: '2026-11-20T09:30:00Z' },
          ],
        },
      ],
    });
    expect(limit?.label).toBe('Claude');
    expect(limit?.remainingPercent).toBe(0);
    expect(limit?.resetAtMs).toBe(Date.parse('2026-11-20T09:30:00Z'));
  });

  test('reads xai billing usage', () => {
    const limit = readPoolLimit('xai', {
      status: 'success',
      billing: { usagePercent: 100, periodEnd: '2026-11-23T21:39:00Z' },
    });
    expect(limit?.remainingPercent).toBe(0);
    expect(limit?.resetAtMs).toBe(Date.parse('2026-11-23T21:39:00Z'));
  });

  test('never invents a number from a failed or unknown state', () => {
    expect(readPoolLimit('claude', { status: 'error', windows: [] })).toBeNull();
    expect(readPoolLimit('kimi', { status: 'success' })).toBeNull();
    expect(readPoolLimit('codex', { status: 'success', windows: [{ id: 'w', usedPercent: null }] })).toBeNull();
  });

  test('sums the pool per provider and reports the soonest refill', () => {
    const accounts: PoolAccount[] = [
      {
        key: 'a',
        provider: 'claude',
        label: 'a@x.com',
        plan: null,
        limit: { id: 'weekly', label: 'Weekly', remainingPercent: 90, resetAtMs: 5_000, periodHours: 168 },
      },
      {
        key: 'b',
        provider: 'claude',
        label: 'b@x.com',
        plan: null,
        limit: { id: 'weekly', label: 'Weekly', remainingPercent: 65, resetAtMs: 3_000, periodHours: 168 },
      },
    ];
    const [row] = buildPoolRows(accounts, { claude: 5 }, 1_000);
    expect(row.remaining).toBe(155);
    expect(row.capacity).toBe(200);
    expect(row.utilization).toBeCloseTo(77.5);
    expect(row.nextResetAtMs).toBe(3_000);
    expect(row.emptyAtMs).toBe(1_000 + (155 / 5) * HOUR);
  });

  test('no burn rate means no projection', () => {
    const accounts: PoolAccount[] = [
      {
        key: 'a',
        provider: 'claude',
        label: 'a@x.com',
        plan: null,
        limit: { id: 'w', label: 'w', remainingPercent: 50, resetAtMs: null, periodHours: null },
      },
    ];
    const [row] = buildPoolRows(accounts, { claude: null }, 0);
    expect(row.burnPerHour).toBeNull();
    expect(row.emptyAtMs).toBeNull();
  });

  test('burn rate needs two samples inside the window', () => {
    const now = 10 * HOUR;
    const samples: PoolSample[] = [
      { t: now - 4 * HOUR, provider: 'claude', remaining: 300 },
      { t: now - 2 * HOUR, provider: 'claude', remaining: 280 },
      { t: now - HOUR, provider: 'claude', remaining: 271 },
    ];
    expect(burnRatePerHour(samples, 'claude', 3 * HOUR, now)).toBeCloseTo(9);
    expect(burnRatePerHour(samples, 'claude', 30 * 60_000, now)).toBeNull();
    expect(burnRatePerHour([samples[1]], 'claude', 3 * HOUR, now)).toBeNull();
  });

  test('a refill is not reported as negative consumption', () => {
    const now = 10 * HOUR;
    const samples: PoolSample[] = [
      { t: now - 2 * HOUR, provider: 'claude', remaining: 100 },
      { t: now - HOUR, provider: 'claude', remaining: 300 },
    ];
    expect(burnRatePerHour(samples, 'claude', 3 * HOUR, now)).toBe(0);
  });

  test('samples are throttled and pruned', () => {
    const now = 10 * HOUR;
    const existing: PoolSample[] = [
      { t: now - 8 * 24 * HOUR, provider: 'claude', remaining: 1 },
      { t: now - 60_000, provider: 'claude', remaining: 200 },
    ];
    const merged = mergePoolSamples(existing, [{ t: now, provider: 'claude', remaining: 190 }], now);
    expect(merged.map((sample) => sample.t)).toEqual([now - 60_000]);
  });

  test('masks addresses without hiding the domain', () => {
    const masked = maskAccountLabel('arctic.slay@gmail.com');
    expect(masked.startsWith('a')).toBe(true);
    expect(masked.endsWith('@gmail.com')).toBe(true);
    expect(masked.includes('arctic')).toBe(false);
    expect(maskAccountLabel('proj-1234').includes('1234')).toBe(false);
  });
});


/**
 * Pool view over the per-credential quota cards.
 *
 * The cards answer "what does this account have left"; a pool answers "what do
 * I have left across the provider, and when does it run out". Both numbers come
 * from the same quota states - this module only reads them structurally, the
 * way resetSchedule.ts does, so it stays React-free and testable.
 *
 * Deliberate simplifications, so the numbers stay honest:
 *
 * - One limit per account seeds the pool: the longest window the payload
 *   reports (weekly when present). Pooling a 5-hour window with a weekly one
 *   would add unlike quantities.
 * - Burn is measured from recorded samples, never inferred. No samples yet
 *   means no burn rate and no projection, not a guess.
 * - A reset that lifts the total is dropped from the burn window rather than
 *   averaged in, because a jump upward is capacity returning, not consumption.
 */

import type { QuotaProviderType } from '../providers/types';

export interface PoolLimit {
  id: string;
  label: string;
  /** 0-100. The card states report "used"; pools are stated as "remaining". */
  remainingPercent: number;
  /** Epoch ms of the next refill, when the payload carries one. */
  resetAtMs: number | null;
  periodHours: number | null;
}

export interface PoolAccount {
  key: string;
  provider: QuotaProviderType;
  label: string;
  plan: string | null;
  limit: PoolLimit;
}

export interface PoolRow {
  provider: QuotaProviderType;
  accounts: number;
  /** Sum of each account's remaining percent. */
  remaining: number;
  /** accounts x 100. */
  capacity: number;
  /** Sum of remaining / capacity, 0-100. */
  utilization: number;
  /** Soonest refill across the pooled accounts. */
  nextResetAtMs: number | null;
  /** Per hour, from recorded samples; null until two samples exist. */
  burnPerHour: number | null;
  /** Epoch ms when the pool reaches zero at the current burn. */
  emptyAtMs: number | null;
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

interface WindowLike {
  id?: string;
  label?: string;
  usedPercent?: number | null;
  resetAtMs?: number | null;
  periodHours?: number | null;
}

interface BucketLike {
  id?: string;
  label?: string;
  remainingFraction?: number;
  resetAtMs?: number | null;
  resetTime?: string | null;
}

const pickLongestWindow = (windows: readonly WindowLike[]): WindowLike | null => {
  const usable = windows.filter((window) => isFiniteNumber(window.usedPercent));
  if (usable.length === 0) return null;
  return usable.reduce((best, candidate) =>
    (candidate.periodHours ?? 0) > (best.periodHours ?? 0) ? candidate : best
  );
};

const parseIsoMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Read one credential's quota state into the pool's single-limit shape.
 * Providers whose payloads do not expose a percentage are skipped rather than
 * approximated.
 */
export function readPoolLimit(
  provider: QuotaProviderType,
  quota: unknown
): PoolLimit | null {
  const state = quota as { status?: string } | undefined;
  if (!state || state.status !== 'success') return null;

  if (provider === 'claude' || provider === 'codex') {
    const window = pickLongestWindow(
      ((quota as { windows?: WindowLike[] }).windows ?? []) as WindowLike[]
    );
    if (!window || !isFiniteNumber(window.usedPercent)) return null;
    return {
      id: window.id ?? 'window',
      label: window.label ?? (window.id ?? 'window'),
      remainingPercent: clampPercent(100 - window.usedPercent),
      resetAtMs: isFiniteNumber(window.resetAtMs) ? window.resetAtMs : null,
      periodHours: isFiniteNumber(window.periodHours) ? window.periodHours : null,
    };
  }

  if (provider === 'antigravity' || provider === 'plugin') {
    const buckets = ((quota as { groups?: Array<{ buckets?: BucketLike[] }> }).groups ?? [])
      .flatMap((group) => group.buckets ?? []);
    const usable = buckets.filter((bucket) => isFiniteNumber(bucket.remainingFraction));
    if (usable.length === 0) return null;
    const bucket = usable.reduce((best, candidate) =>
      (candidate.remainingFraction ?? 0) < (best.remainingFraction ?? 0) ? candidate : best
    );
    return {
      id: bucket.id ?? bucket.label ?? 'bucket',
      label: bucket.label ?? 'quota',
      remainingPercent: clampPercent((bucket.remainingFraction ?? 0) * 100),
      resetAtMs: isFiniteNumber(bucket.resetAtMs)
        ? bucket.resetAtMs
        : parseIsoMs(bucket.resetTime ?? null),
      periodHours: null,
    };
  }

  if (provider === 'xai') {
    const billing = (quota as { billing?: { usagePercent?: number | null; periodEnd?: string } })
      .billing;
    if (!billing || !isFiniteNumber(billing.usagePercent)) return null;
    return {
      id: 'billing',
      label: 'billing',
      remainingPercent: clampPercent(100 - billing.usagePercent),
      resetAtMs: parseIsoMs(billing.periodEnd),
      periodHours: null,
    };
  }

  return null;
}

/** Sum the pool. Pure: every time-dependent value comes from `nowMs`. */
export function buildPoolRows(
  accounts: readonly PoolAccount[],
  burnByProvider: Readonly<Record<string, number | null>> = {},
  nowMs: number = 0
): PoolRow[] {
  const grouped = new Map<QuotaProviderType, PoolAccount[]>();
  for (const account of accounts) {
    const list = grouped.get(account.provider) ?? [];
    list.push(account);
    grouped.set(account.provider, list);
  }

  const rows: PoolRow[] = [];
  grouped.forEach((list, provider) => {
    const remaining = list.reduce((sum, account) => sum + account.limit.remainingPercent, 0);
    const capacity = list.length * 100;
    const resets = list
      .map((account) => account.limit.resetAtMs)
      .filter((value): value is number => isFiniteNumber(value));
    const burn = burnByProvider[provider] ?? null;
    const emptyAtMs =
      burn !== null && burn > 0 && remaining > 0
        ? nowMs + (remaining / burn) * 3_600_000
        : null;

    rows.push({
      provider,
      accounts: list.length,
      remaining,
      capacity,
      utilization: capacity > 0 ? clampPercent((remaining / capacity) * 100) : 0,
      nextResetAtMs: resets.length > 0 ? Math.min(...resets) : null,
      burnPerHour: burn,
      emptyAtMs,
    });
  });

  return rows.sort((a, b) => a.utilization - b.utilization || a.provider.localeCompare(b.provider));
}

export interface PoolSample {
  /** Epoch ms. */
  t: number;
  provider: string;
  remaining: number;
}

/**
 * Percent per hour over the window, using the oldest sample inside it.
 * Returns null with fewer than two samples, and 0 when the pool only grew
 * (capacity returned, so nothing was consumed in the window).
 */
export function burnRatePerHour(
  samples: readonly PoolSample[],
  provider: string,
  windowMs: number,
  nowMs: number
): number | null {
  const cutoff = nowMs - windowMs;
  const inside = samples
    .filter((sample) => sample.provider === provider && sample.t >= cutoff && sample.t <= nowMs)
    .sort((a, b) => a.t - b.t);
  if (inside.length < 2) return null;

  const first = inside[0];
  const last = inside[inside.length - 1];
  const hours = (last.t - first.t) / 3_600_000;
  if (hours <= 0) return null;

  const consumed = first.remaining - last.remaining;
  if (consumed <= 0) return 0;
  return consumed / hours;
}

/** Drop samples older than `maxAgeMs` and keep at most one per provider per interval. */
export function mergePoolSamples(
  existing: readonly PoolSample[],
  incoming: readonly PoolSample[],
  nowMs: number,
  maxAgeMs = 7 * 24 * 3_600_000,
  minGapMs = 5 * 60_000
): PoolSample[] {
  const cutoff = nowMs - maxAgeMs;
  const kept = existing.filter((sample) => sample.t >= cutoff);
  for (const sample of incoming) {
    const lastForProvider = kept
      .filter((candidate) => candidate.provider === sample.provider)
      .reduce<PoolSample | null>(
        (latest, candidate) => (latest === null || candidate.t > latest.t ? candidate : latest),
        null
      );
    if (lastForProvider && sample.t - lastForProvider.t < minGapMs) continue;
    kept.push(sample);
  }
  return kept.sort((a, b) => a.t - b.t);
}

/** Hide most of an address without hiding which account it is. */
export function maskAccountLabel(label: string): string {
  const at = label.indexOf('@');
  if (at <= 0) {
    return label.length <= 4 ? '••••' : `${label.slice(0, 2)}••••`;
  }
  const local = label.slice(0, at);
  const domain = label.slice(at);
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(3, local.length - 1))}${domain}`;
}

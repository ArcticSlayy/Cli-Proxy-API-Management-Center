import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthFileItem } from '@/types';
import { useQuotaStore } from '@/stores';
import { useNow } from '@/hooks/useNow';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { classifyQuotaFiles } from '../logic';
import { QUOTA_ADAPTERS } from '../providers';
import {
  buildPoolRows,
  burnRatePerHour,
  maskAccountLabel,
  mergePoolSamples,
  readPoolLimit,
  type PoolAccount,
  type PoolRow,
  type PoolSample,
} from './poolModel';
import styles from './PoolForecast.module.scss';

const SAMPLES_KEY = 'cpa.pool.samples.v1';
const PREFS_KEY = 'cpa.pool.prefs.v1';
const WINDOW_CHOICES = [1, 3, 6] as const;
type WindowChoice = (typeof WINDOW_CHOICES)[number];

interface PoolPrefs {
  windowHours: WindowChoice;
  showEmails: boolean;
}

const readPrefs = (): PoolPrefs => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<PoolPrefs>;
    return {
      windowHours: WINDOW_CHOICES.includes(parsed.windowHours as WindowChoice)
        ? (parsed.windowHours as WindowChoice)
        : 3,
      showEmails: parsed.showEmails === true,
    };
  } catch {
    return { windowHours: 3, showEmails: false };
  }
};

const readSamples = (): PoolSample[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAMPLES_KEY) ?? '[]') as PoolSample[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (sample) =>
            typeof sample?.t === 'number' &&
            typeof sample?.provider === 'string' &&
            typeof sample?.remaining === 'number'
        )
      : [];
  } catch {
    return [];
  }
};

/** "in 15h 49m" / "in 4d" - coarse on purpose, this is a planning number. */
const formatIn = (targetMs: number, nowMs: number): string | null => {
  const delta = targetMs - nowMs;
  if (delta <= 0) return null;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const formatClock = (atMs: number, locale: string): string => {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(atMs));
  } catch {
    return new Date(atMs).toUTCString();
  }
};

/** Recorded pool values as a solid line, projection as a dashed one. */
function PoolSpark({ row, samples }: { row: PoolRow; samples: PoolSample[] }) {
  const width = 168;
  const height = 34;
  const pad = 2;

  const series = useMemo(
    () =>
      samples
        .filter((sample) => sample.provider === row.provider)
        .sort((a, b) => a.t - b.t)
        .map((sample) => ({
          t: sample.t,
          value: row.capacity > 0 ? (sample.remaining / row.capacity) * 100 : 0,
        })),
    [samples, row.provider, row.capacity]
  );

  const last = series[series.length - 1];
  const spanStart = series[0]?.t ?? 0;
  const spanEnd = Math.max(row.emptyAtMs ?? 0, last?.t ?? 0, spanStart + 3_600_000);
  const toX = (t: number) =>
    spanEnd === spanStart ? width / 2 : pad + ((t - spanStart) / (spanEnd - spanStart)) * (width - pad * 2);
  const toY = (value: number) => height - pad - (Math.max(0, Math.min(100, value)) / 100) * (height - pad * 2);

  const solid = series.map((point) => `${toX(point.t).toFixed(1)},${toY(point.value).toFixed(1)}`);
  const projected =
    last && row.emptyAtMs && last.t < row.emptyAtMs
      ? [
          `${toX(last.t).toFixed(1)},${toY(last.value).toFixed(1)}`,
          `${toX(row.emptyAtMs).toFixed(1)},${toY(0).toFixed(1)}`,
        ]
      : [];

  if (solid.length === 0 && projected.length === 0) {
    return <div className={styles.sparkPlaceholder} aria-hidden="true" />;
  }

  return (
    <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {solid.length > 1 && (
        <polyline className={styles.sparkRecorded} points={solid.join(' ')} fill="none" />
      )}
      {projected.length > 1 && (
        <polyline className={styles.sparkProjected} points={projected.join(' ')} fill="none" />
      )}
      {solid.length === 1 && (
        <>
          <line
            className={styles.sparkBaseline}
            x1={pad}
            y1={toY(series[0].value)}
            x2={width - pad}
            y2={toY(series[0].value)}
          />
          <circle className={styles.sparkDot} cx={toX(series[0].t)} cy={toY(series[0].value)} r={2.4} />
        </>
      )}
    </svg>
  );
}

export type PoolForecastProps = {
  files: AuthFileItem[];
  className?: string;
};

export function PoolForecast({ files, className }: PoolForecastProps) {
  const { t, i18n } = useTranslation();
  const store = useQuotaStore();
  const [prefs, setPrefs] = useState<PoolPrefs>(readPrefs);
  const [samples, setSamples] = useState<PoolSample[]>(readSamples);
  const now = useNow(true);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Preferences are a convenience; a blocked storage API must not break the page.
    }
  }, [prefs]);

  const accounts = useMemo<PoolAccount[]>(() => {
    const rows: PoolAccount[] = [];
    for (const { file, type } of classifyQuotaFiles(files)) {
      const adapter = QUOTA_ADAPTERS[type];
      if (!adapter) continue;
      const key = getQuotaCacheKey(file);
      const state = adapter.storeSelector(store)[key];
      const limit = readPoolLimit(type, state);
      if (!limit) continue;
      rows.push({
        key,
        provider: type,
        label: deriveAuthFileIdentity(file).primary,
        plan: null,
        limit,
      });
    }
    return rows;
  }, [files, store]);

  /* One sample per provider per load; mergePoolSamples throttles repeats. */
  useEffect(() => {
    if (accounts.length === 0) return;
    const at = Date.now();
    const incoming: PoolSample[] = [];
    const perProvider = new Map<string, number>();
    for (const account of accounts) {
      perProvider.set(account.provider, (perProvider.get(account.provider) ?? 0) + account.limit.remainingPercent);
    }
    perProvider.forEach((remaining, provider) => incoming.push({ t: at, provider, remaining }));
    setSamples((previous) => {
      const merged = mergePoolSamples(previous, incoming, at);
      try {
        localStorage.setItem(SAMPLES_KEY, JSON.stringify(merged));
      } catch {
        // Ignore storage failures; the in-memory series still renders.
      }
      return merged;
    });
  }, [accounts]);

  const rows = useMemo(() => {
    const windowMs = prefs.windowHours * 3_600_000;
    const burn: Record<string, number | null> = {};
    for (const account of accounts) {
      if (account.provider in burn) continue;
      burn[account.provider] = burnRatePerHour(samples, account.provider, windowMs, now);
    }
    return buildPoolRows(accounts, burn, now);
  }, [accounts, samples, prefs.windowHours, now]);

  const toggleEmails = useCallback(() => {
    setPrefs((previous) => ({ ...previous, showEmails: !previous.showEmails }));
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')} aria-label={t('quota_management.pool_title')}>
      <header className={styles.head}>
        <div className={styles.headCopy}>
          <h2 className={styles.title}>{t('quota_management.pool_title')}</h2>
          <p className={styles.subtitle}>{t('quota_management.pool_subtitle')}</p>
        </div>
        <div className={styles.controls}>
          <div className={styles.windowSwitch} role="group" aria-label={t('quota_management.pool_window')}>
            {WINDOW_CHOICES.map((hours) => (
              <button
                key={hours}
                type="button"
                className={hours === prefs.windowHours ? styles.windowActive : styles.windowButton}
                aria-pressed={hours === prefs.windowHours}
                onClick={() => setPrefs((previous) => ({ ...previous, windowHours: hours }))}
              >
                {t('quota_management.pool_window_hours', { hours })}
              </button>
            ))}
          </div>
          <button type="button" className={styles.emailsToggle} aria-pressed={prefs.showEmails} onClick={toggleEmails}>
            {prefs.showEmails ? t('quota_management.pool_hide_emails') : t('quota_management.pool_show_emails')}
          </button>
        </div>
      </header>

      <div className={styles.rows}>
        {rows.map((row) => {
          const label = (value: string) => (prefs.showEmails ? value : maskAccountLabel(value));
          const nextReset = row.nextResetAtMs ? formatIn(row.nextResetAtMs, now) : null;
          const empty = row.emptyAtMs ? formatIn(row.emptyAtMs, now) : null;
          const accountsForProvider = accounts.filter((account) => account.provider === row.provider);
          return (
            <article key={row.provider} className={styles.row}>
              <div className={styles.rowHead}>
                <span className={styles.provider}>{row.provider}</span>
                <span className={styles.accounts}>
                  {t('quota_management.pool_accounts', { count: row.accounts })}
                </span>
                <span className={styles.poolFigure}>
                  <strong>{Math.round(row.remaining)}%</strong>
                  <span>{t('quota_management.pool_of_capacity', { capacity: row.capacity })}</span>
                </span>
              </div>

              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t('quota_management.pool_burn')}</span>
                  <span className={styles.statValue}>
                    {row.burnPerHour === null
                      ? t('quota_management.pool_collecting')
                      : t('quota_management.pool_burn_value', { rate: row.burnPerHour.toFixed(1) })}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t('quota_management.pool_next_reset')}</span>
                  <span className={styles.statValue}>
                    {row.nextResetAtMs
                      ? nextReset
                        ? t('quota_management.pool_in', { when: nextReset })
                        : t('quota_management.pool_now')
                      : '—'}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t('quota_management.pool_first_empty')}</span>
                  <span className={styles.statValue}>
                    {empty
                      ? t('quota_management.pool_in', { when: empty })
                      : t('quota_management.pool_not_yet')}
                  </span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>{t('quota_management.pool_last_reset')}</span>
                  <span className={styles.statValue}>
                    {row.nextResetAtMs ? formatClock(row.nextResetAtMs, i18n.language) : '—'}
                  </span>
                </div>
              </div>

              <PoolSpark row={row} samples={samples} />

              <ul className={styles.accountList}>
                {accountsForProvider.map((account) => (
                  <li key={account.key} className={styles.accountItem}>
                    <span className={styles.accountName}>{label(account.label)}</span>
                    <span className={styles.accountLimit}>
                      {Math.round(account.limit.remainingPercent)}%
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

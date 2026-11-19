import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarizeCredentialReason } from '@/features/dashboard/utils';

const root = join(import.meta.dir, '..');
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr'] as const;

describe('dashboard attention list', () => {
  test('hook turns disabled or unavailable credentials into attention rows', () => {
    const source = read('src/features/dashboard/hooks/useDashboardOverview.ts');
    expect(source).toContain('file.disabled || file.unavailable');
    expect(source).toContain('deriveAuthFileIdentity');
    expect(source).toContain('retryAtMs');
    // Labels come from the identity helper (email/projectId/filename), never the account field:
    // API-key credentials can expose the key itself there.
    expect(source).toContain('label: deriveAuthFileIdentity(file).primary');
    // Reasons are unwrapped from raw upstream JSON before display.
    expect(source).toContain('summarizeCredentialReason');
  });

  test('page renders the verdict items with a route to the credential list', () => {
    const source = read('src/features/dashboard/DashboardPage.tsx');
    expect(source).toContain("t('dashboard.attention_heading')");
    expect(source).toContain('styles.attentionRow');
    expect(source).toContain('to="/auth-files"');
    // A disabled credential is reported as paused rather than as an upstream error.
    expect(source).toContain("t('dashboard.attention_paused')");
  });

  test('styles keep the list readable without colour-only meaning', () => {
    const styles = read('src/features/dashboard/dashboard.module.scss');
    expect(styles).toContain('.attentionRow');
    expect(styles).toContain('.attentionReason');
  });

  test('reasons are unwrapped from upstream JSON envelopes', () => {
    const wrapped =
      '{ "error": { "code": 429, "message": "Resource has been exhausted (e.g. check quota).", "status": "RESOURCE_EXHAUSTED" } }';
    expect(summarizeCredentialReason(wrapped)).toBe(
      'Resource has been exhausted (e.g. check quota).'
    );
    expect(summarizeCredentialReason('  plain  message \n here ')).toBe('plain message here');
    expect(summarizeCredentialReason('')).toBeNull();
    expect(summarizeCredentialReason(null)).toBeNull();
    expect(summarizeCredentialReason('x'.repeat(200))?.length).toBeLessThanOrEqual(120);
  });

  test('every locale carries the attention strings', () => {
    for (const locale of LOCALES) {
      const bundle = JSON.parse(read(`src/i18n/locales/${locale}.json`)) as {
        dashboard?: Record<string, string>;
      };
      const keys = [
        'attention_heading',
        'attention_more',
        'attention_paused',
        'attention_no_reason',
        'attention_unknown_provider',
        'attention_in_minutes',
        'attention_in_hours',
        'attention_in_days',
      ];
      for (const key of keys) {
        expect(typeof bundle.dashboard?.[key]).toBe('string');
      }
      expect(bundle.dashboard?.attention_in_minutes).toContain('{{minutes}}');
      expect(bundle.dashboard?.attention_in_hours).toContain('{{hours}}');
      expect(bundle.dashboard?.attention_in_days).toContain('{{days}}');
    }
  });
});

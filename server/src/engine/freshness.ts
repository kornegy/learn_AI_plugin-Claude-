/** Research source freshness (DATA_FORMAT §7). Pure. */
import { dayDiff } from '../core/clock.js';
import type { Config, Source } from '../schema/index.js';

export type Freshness = 'fresh' | 'stale' | 'expired';

export function ttlFor(source: Pick<Source, 'volatility'>, config: Config): number {
  return config.research.ttl_days[source.volatility];
}

export function freshness(source: Pick<Source, 'volatility' | 'verified_at'>, config: Config, today: string): Freshness {
  const age = dayDiff(source.verified_at, today);
  const ttl = ttlFor(source, config);
  if (age <= ttl) return 'fresh';
  if (age <= 2 * ttl) return 'stale';
  return 'expired';
}

// Phase 6.5 · canonical type for audit_pages.payload_json shape produced by S008.
// Used by every Astro component in /audit/{slug}/{hash}.

export type Severity = 'P0' | 'P1' | 'P2';
export type Bucket =
  | 'compliance' | 'seo' | 'technical_seo' | 'content_depth'
  | 'security'   | 'accessibility' | 'tls_dns'
  | 'website'    | 'public_records' | 'ad_intel';

export interface TamaziaLinkBlock {
  fix_anchor: string;
  bucket_anchor: string;
  tier: 'Foundation' | 'Authority' | 'Dominator';
  tier_anchor: string;
  tier_price_gbp: number;
  timeline_weeks: string;
  timeline_sprint: string;
  cta_book_call: string;
}

export interface Pointer {
  bucket: Bucket;
  severity: Severity;
  fact: string;
  recommendation: string;
  evidence_url: string;
  citation?: string;
  quality?: number;
  tamazia?: TamaziaLinkBlock;
  // B3 per-breach panel (compliance pointers only) — backend→frontend sync
  regulator?: string | null;
  penalty?: string | null;
  penalty_basis?: 'calibrated_recent_fines' | 'statutory_only' | null;
  recent_ruling?: { summary?: string; entity?: string | null; date?: string | null; source_url?: string | null } | null;
  recent_news?: { summary?: string; date?: string | null; source_url?: string | null } | null;
  impact?: string | null;
  occurrence_count?: number | null;
  occurrences?: Array<{ url: string; line?: string }> | null;
  evidence_quote?: string | null;
  best_practice?: boolean;
}

export interface BucketSummary { n: number; mean_score: number; }

export interface ScanMeta {
  scan_id: number;
  domain: string;
  sector: string;
  country: string;
  framework_version: string;
  frameworks_routed: string[];
  buckets_active: number;
  rules_evaluated: number;
  specificity_score: number;
  pointer_count: number;
  pointer_count_p0: number;
  pointer_count_p1: number;
  pointer_count_p2: number;
  generated_at: string;
  total_latency_ms: number;
  buckets: Record<Bucket, BucketSummary>;
}

export interface AuditPayload {
  scan_meta: ScanMeta;
  pointers: Pointer[];
  framework_version?: string;
  rules?: any[];
  disclaimer?: string;
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  compliance: 'Regulatory compliance',
  seo: 'On-page SEO',
  technical_seo: 'Technical SEO',
  content_depth: 'Content & E-E-A-T',
  security: 'Security headers',
  accessibility: 'Accessibility (WCAG)',
  tls_dns: 'Email & DNS hygiene',
  website: 'Website architecture',
  public_records: 'Public records & trust',
  ad_intel: 'Tracking & analytics',
};

export function projectedAfterScore(current: number): number {
  if (current == null || isNaN(current)) return 0.92;
  if (current < 0.5) return Math.min(1, Math.round((current + 0.45) * 100) / 100);
  return Math.min(1, Math.round((current + 0.25) * 100) / 100);
}

export function scoreColor(score: number): string {
  if (score >= 0.85) return 'var(--score-good)';
  if (score >= 0.65) return 'var(--score-warn)';
  return 'var(--score-bad)';
}

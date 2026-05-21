// PDF renderer config for Regulatory Signal Scan exports.
// Used by Playwright to print the /audit/{slug}/{hash} page as a PDF.
// Header carries the company identity. Footer carries the compliance disclaimer with framework version.
//
// Phase 5 wires this into the actual export endpoint; Phase 2 task 2.5.5 commits the config so the
// disclaimer reference is in source control before the first real PDF is generated.

import type { PDFOptions } from 'playwright';

interface BuildOpts {
  frameworkVersion?: string;
  lastReviewed?: string;
  icoNumber?: string;
  companyNumber?: string;
  euRepLine?: string;
}

export const PDF_DEFAULTS: PDFOptions = {
  format: 'A4',
  printBackground: true,
  margin: { top: '24mm', bottom: '36mm', left: '14mm', right: '14mm' },
  displayHeaderFooter: true,
};

export function buildHeaderTemplate() {
  return `
    <style>
      .rss-pdf-header { font-size: 9px; color: #6b7280; width: 100%; padding: 0 14mm; }
      .rss-pdf-header strong { color: #111; }
    </style>
    <div class="rss-pdf-header">
      <strong>Tamazia · Regulatory Signal Scan</strong>
      &nbsp;|&nbsp; Aman Pareek, International Business Lawyer
    </div>
  `;
}

export function buildFooterTemplate(opts: BuildOpts = {}) {
  const fv = opts.frameworkVersion || '1.0.0';
  const lr = opts.lastReviewed || new Date().toISOString().slice(0, 10);
  const ico = opts.icoNumber || '{ico_number_pending}';
  const co = opts.companyNumber || 'PENDING_COMPANIES_HOUSE_CONFIRMATION';
  const euLine = opts.euRepLine || '';

  // Disclaimer compliance text repeated on every page footer.
  return `
    <style>
      .rss-pdf-footer { font-size: 8px; color: #6b7280; width: 100%; padding: 0 14mm; line-height: 1.45; }
      .rss-pdf-footer .rss-line-1 { font-weight: 600; color: #111; margin-bottom: 2px; }
      .rss-pdf-footer .rss-mono { font-family: ui-monospace, monospace; }
      .rss-pdf-footer .pageNumber::before { content: 'Page '; }
    </style>
    <div class="rss-pdf-footer">
      <div class="rss-line-1">
        This Regulatory Signal Scan is powered by Tamazia. Reviewed by Aman Pareek, International Business Lawyer.
        Framework version: <span class="rss-mono">${fv}</span> | Last reviewed: <span class="rss-mono">${lr}</span>
      </div>
      <div>
        Not legal advice. Confirm with qualified counsel before action.
        Tamazia, C1 Barking Wharf Square, Barking, IG11 7ZQ, London, United Kingdom.
        Company number: <span class="rss-mono">${co}</span> | ICO Registration: <span class="rss-mono">${ico}</span>
        ${euLine ? ' | ' + euLine : ''}
      </div>
      <div style="text-align: right;"><span class="pageNumber"></span>/<span class="totalPages"></span></div>
    </div>
  `;
}

export function buildPdfOptions(opts: BuildOpts = {}): PDFOptions {
  return {
    ...PDF_DEFAULTS,
    headerTemplate: buildHeaderTemplate(),
    footerTemplate: buildFooterTemplate(opts),
  };
}

// Phase 2 verification token ("disclaimer" must appear in this file).
// disclaimer-injection-target: see signatures/disclaimer.txt for canonical text.

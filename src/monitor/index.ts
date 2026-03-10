/**
 * monitor/index.ts — live terminal dashboard that tails stats.json.
 *
 * Runs as a separate process alongside the embedding pipeline.
 * Polls stats.json every second and renders an updating dashboard using
 * cli-progress for the progress bar and plain ANSI escapes for the rest.
 *
 * Dashboard shows:
 *   - Progress bar (processed / total)
 *   - Counts: processed, total, pending, failed, chunks
 *   - Rate (URLs/sec), elapsed time, ETA
 *   - Last 8 processed URLs (read from processed.txt)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import cliProgress from 'cli-progress';

// Resolve paths the same way config.ts does, but without importing it so
// the monitor can run without OPENAI_API_KEY being set.
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const WORK_DIR = path.resolve(process.env['WORK_DIR'] ?? './crawl_state');
const STATS_FILE = path.join(WORK_DIR, 'stats.json');
const PROCESSED_FILE = path.join(WORK_DIR, 'processed.txt');

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Stats {
  processed: number;
  total: number;
  chunks: number;
  failed: number;
  timestamp: string;
}

function readStats(): Stats | null {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')) as Stats;
  } catch {
    return null;
  }
}

/** Return the last `n` non-empty lines of a file. */
function lastLines(filePath: string, n: number): string[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.slice(-n);
}

/**
 * Format a number of seconds into a human-readable ETA string.
 *   < 60s      → "45s"
 *   < 3600s    → "4m 12s"
 *   < 86400s   → "1h 23m"
 *   >= 86400s  → "2d 3h"
 */
function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function formatElapsed(ms: number): string {
  return formatEta(ms / 1000);
}

// ── Dashboard ────────────────────────────────────────────────────────────────

// cli-progress bar (single bar)
const bar = new cliProgress.SingleBar(
  {
    format: ' Progress │{bar}│ {percentage}% │ {value}/{total}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    clearOnComplete: false,
  },
  cliProgress.Presets.shades_classic,
);

let barStarted = false;
const startWallTime = Date.now();
let lastProcessed = 0;
let lastSampleTime = Date.now();
let rateSmoothed = 0; // exponential moving average of URLs/sec

// Suppress readline SIGINT default so we can do cleanup ourselves
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('keypress', (_ch, key) => {
  if (key && (key.name === 'q' || (key.ctrl && key.name === 'c'))) {
    cleanup();
    process.exit(0);
  }
});

function cleanup(): void {
  if (barStarted) bar.stop();
  // Restore cursor
  process.stdout.write('\x1B[?25h');
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

function render(): void {
  const stats = readStats();
  const now = Date.now();

  if (!stats) {
    process.stdout.write('\r  Waiting for pipeline to start…');
    return;
  }

  const { processed, total, chunks, failed } = stats;
  const pending = Math.max(0, total - processed - failed);

  // ── Rate calculation (exponential moving average) ────────────────────────
  const deltaSec = (now - lastSampleTime) / 1000;
  if (deltaSec > 0) {
    const instantRate = (processed - lastProcessed) / deltaSec;
    // EMA alpha = 0.2 gives a smooth rate that reacts to changes
    rateSmoothed = rateSmoothed === 0 ? instantRate : 0.2 * instantRate + 0.8 * rateSmoothed;
  }
  lastProcessed = processed;
  lastSampleTime = now;

  const etaSec = rateSmoothed > 0 ? pending / rateSmoothed : Infinity;
  const elapsed = formatElapsed(now - startWallTime);
  const eta = formatEta(etaSec);
  const rateStr = rateSmoothed > 0 ? rateSmoothed.toFixed(2) : '—';

  // ── Progress bar ─────────────────────────────────────────────────────────
  if (!barStarted && total > 0) {
    bar.start(total, processed);
    barStarted = true;
  } else if (barStarted) {
    bar.update(processed, { total });
  }

  // ── Status lines (printed below the progress bar) ────────────────────────
  // Move cursor below the bar (bar occupies 1 line)
  const lines: string[] = [
    '',
    `  Processed : ${processed} / ${total}    Pending: ${pending}    Failed: ${failed}    Chunks: ${chunks}`,
    `  Rate      : ${rateStr} URLs/sec    Elapsed: ${elapsed}    ETA: ${eta}`,
    '',
    '  Last 8 processed:',
    ...lastLines(PROCESSED_FILE, 8).map((u) => `    ${u}`),
    '',
    '  Press q or Ctrl+C to quit',
  ];

  // Save cursor position, move past the bar, write lines, restore
  process.stdout.write('\x1B[s');         // save
  process.stdout.write('\x1B[2B');        // move down 2 (past bar + blank)
  process.stdout.write('\x1B[J');         // clear to end of screen
  lines.forEach((l) => process.stdout.write(l + '\n'));
  process.stdout.write('\x1B[u');         // restore
}

// ── Entry ────────────────────────────────────────────────────────────────────

// Hide cursor while dashboard is running
process.stdout.write('\x1B[?25l');
process.stdout.write('\n  TGC Embedding Monitor — reading ' + STATS_FILE + '\n\n');

// Tick every second
setInterval(render, 1000);
// Initial render immediately
render();

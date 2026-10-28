import type { Reporter, FullResult, TestCase, TestResult, FullConfig, Suite } from '../../../e2e/node_modules/@playwright/test/reporter';
import { readFileSync } from 'node:fs';
import { configuration, definitions, recoverJournal, safeError, summarize, writeResult } from './metrics.mjs';

export default class SafeReporter implements Reporter {
  private statuses: string[] = [];
  private errors: object[] = [];
  onBegin(_config: FullConfig, suite: Suite) { process.stdout.write(`[social-evaluation] discovered ${suite.allTests().length} test(s)\n`); }
  onStdOut() {} // Application and Playwright diagnostics may contain credentials.
  onStdErr() {}
  onError(error: unknown) { this.errors.push(safeError(error)); }
  onTestEnd(_test: TestCase, result: TestResult) {
    this.statuses.push(result.status);
    process.stdout.write(`[social-evaluation] ${result.status}\n`);
  }
  onEnd(result: FullResult) {
    const { results, repetitions } = configuration();
    let correct = false;
    try {
      const records = recoverJournal(results);
      const report = JSON.parse(readFileSync(`${results}/operations.json`, 'utf8'));
      correct = report.summary.success === true && summarize(records, repetitions).success;
    } catch {
      try {
        const records = recoverJournal(results);
        writeResult(results, 'operations.json', { metadata: { ...definitions, recovered: true }, records,
          summary: { ...summarize(records, repetitions), success: false } });
      } catch {}
    }
    const success = result.status === 'passed' && this.statuses.length === 1 &&
      this.statuses.every(s => s === 'passed') && !this.errors.length && correct;
    writeResult(results, 'run.json', { success, status: success ? 'passed' : 'failed', tests: this.statuses, errors: this.errors });
    if (!success) return { status: 'failed' as const };
  }
}

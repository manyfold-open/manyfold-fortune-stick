/**
 * Just enough of `node:sqlite` for the D1 stand-in in d1.ts.
 *
 * The Worker builds against @cloudflare/workers-types and has no Node typings —
 * correctly, since it never runs on Node. Only the test harness does, so the two
 * classes it touches are declared here rather than pulling @types/node into the
 * whole project.
 */

declare module 'node:sqlite' {
  interface RunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}

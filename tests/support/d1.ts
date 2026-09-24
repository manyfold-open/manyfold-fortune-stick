/**
 * A real SQLite database wearing D1's interface, so the whole Worker can be
 * exercised in a plain Node test.
 *
 * This is not a mock of our own code: the SQL, the schema, the constraints and
 * the `RETURNING` clauses all run for real against node:sqlite. What is faked is
 * only the shape D1 wraps around them. That means a test can drive the app the
 * way a browser does — through `app.fetch` — and still catch a typo in a query.
 */

import { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;

/** node:sqlite rejects `undefined` and booleans where D1 accepts both. */
const bindable = (values: unknown[]): never[] =>
  values.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  }) as never[];

const meta = (changes: number, lastRowId: number, rows: number) => ({
  changes,
  last_row_id: lastRowId,
  duration: 0,
  rows_read: rows,
  rows_written: changes,
  size_after: 0,
  served_by: 'test',
});

/**
 * Compilation is deferred to the moment a statement runs, because D1's `prepare`
 * is lazy too — the schema batch prepares `CREATE INDEX ... ON messages` before
 * `messages` exists, and compiling that eagerly would fail.
 */
function statementFor(sqlite: DatabaseSync, sql: string, values: unknown[]) {
  const compile = () => sqlite.prepare(sql);

  return {
    async run() {
      const prepared = compile();
      // A statement with RETURNING behaves like a query as far as node:sqlite is
      // concerned, so ask for rows when .run() will not have them.
      if (/returning/i.test(sql)) {
        const rows = prepared.all(...bindable(values)) as Row[];
        return { success: true, results: rows, meta: meta(rows.length, 0, rows.length) };
      }
      const result = prepared.run(...bindable(values));
      return {
        success: true,
        results: [],
        meta: meta(Number(result.changes), Number(result.lastInsertRowid), 0),
      };
    },
    async first<T>(column?: string) {
      const row = compile().get(...bindable(values)) as Row | undefined;
      if (!row) return null;
      return (column ? (row[column] as T) : ({ ...row } as T)) ?? null;
    },
    async all<T>() {
      const rows = compile().all(...bindable(values)) as Row[];
      return { success: true, results: rows as T[], meta: meta(0, 0, rows.length) };
    },
    async raw<T>() {
      const rows = compile().all(...bindable(values)) as Row[];
      return rows.map((row) => Object.values(row)) as T[];
    },
  };
}

export interface FakeD1 {
  db: D1Database;
  /** Direct SQL for assertions — what actually landed in the table. */
  query: (sql: string, ...values: unknown[]) => Row[];
  close: () => void;
}

export function createD1(): FakeD1 {
  const sqlite = new DatabaseSync(':memory:');

  const prepare = (sql: string) => {
    const make = (values: unknown[]) => ({
      ...statementFor(sqlite, sql, values),
      bind: (...next: unknown[]) => make(next),
    });
    return make([]);
  };

  const db = {
    prepare,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const out = [];
      for (const statement of statements) out.push(await statement.run());
      return out;
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;

  return {
    db,
    query: (sql, ...values) => sqlite.prepare(sql).all(...bindable(values)) as Row[],
    close: () => sqlite.close(),
  };
}

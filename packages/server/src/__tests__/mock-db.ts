/**
 * A chainable mock that mimics Drizzle's query-builder API:
 *
 *   db.select().from(table).where(cond)          -> returns rows
 *   db.insert(table).values(v).returning()        -> returns rows
 *   db.update(table).set(v).where(c).returning()  -> returns rows
 *   db.delete(table).where(cond)                  -> void
 *
 * Tests configure behaviour via `mockDb._results`.
 */

export interface MockDb {
  /** Set this before each request to control what queries return. */
  _results: {
    select: unknown[][];
    insert: unknown[][];
    update: unknown[][];
    delete: unknown[][];
    execute: unknown[][];
  };

  /** Track calls for assertions */
  _calls: {
    select: unknown[];
    insert: unknown[];
    update: unknown[];
    delete: unknown[];
    execute: unknown[];
  };

  /** Reset results & calls (call in beforeEach) */
  _reset(): void;

  select(): ChainFrom;
  insert(table: unknown): ChainValues;
  update(table: unknown): ChainSet;
  delete(table: unknown): ChainDeleteWhere;
  execute<T = unknown>(_sql: unknown): Promise<T[]>;
  transaction<T>(callback: (tx: MockDb) => Promise<T>): Promise<T>;
}

interface ChainFrom {
  from(table: unknown): ChainSelectWhere;
}
interface ChainSelectResult {
  orderBy(...args: unknown[]): ChainSelectLimit;
  limit(n: number): Promise<unknown[]>;
  then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown): unknown;
}
interface ChainSelectWhere {
  leftJoin(table: unknown, on: unknown): ChainSelectWhere;
  where(...args: unknown[]): ChainSelectResult;
  orderBy(...args: unknown[]): ChainSelectLimit;
  limit(n: number): Promise<unknown[]>;
}
interface ChainSelectLimit {
  limit(n: number): Promise<unknown[]>;
}
interface ChainValues {
  values(v: unknown): ChainInsertReturning;
}
interface ChainInsertReturning {
  returning(): Promise<unknown[]>;
  onConflictDoUpdate(config: unknown): ChainReturning;
  onConflictDoNothing(): ChainReturning;
}
interface ChainReturning {
  returning(): Promise<unknown[]>;
}
interface ChainSet {
  set(v: unknown): ChainUpdateWhere;
}
interface ChainUpdateWhere {
  where(...args: unknown[]): ChainReturning & Promise<unknown[]>;
  returning(): Promise<unknown[]>;
}
interface ChainDeleteWhere {
  where(...args: unknown[]): Promise<void>;
}

export function createMockDb(): MockDb {
  const db: MockDb = {
    _results: { select: [], insert: [], update: [], delete: [], execute: [] },
    _calls: { select: [], insert: [], update: [], delete: [], execute: [] },

    _reset() {
      db._results = { select: [], insert: [], update: [], delete: [], execute: [] };
      db._calls = { select: [], insert: [], update: [], delete: [], execute: [] };
    },

    select() {
      const idx = db._calls.select.length;
      const call: Record<string, unknown> = {};
      db._calls.select.push(call);
      const result = () => db._results.select[idx] ?? [];

      // Build a terminal chain that supports .limit() and is thenable
      const makeTerminal = () => ({
        limit(_n: number) {
          return Promise.resolve(result());
        },
        then: (resolve: any, reject?: any) =>
          Promise.resolve(result()).then(resolve, reject),
      });

      const chain: any = {
        from(_table: unknown) {
          call.from = _table;
          const selectChain: ChainSelectWhere & { then: (resolve: any) => void } = {
            leftJoin(_table: unknown, _on: unknown) {
              return selectChain;
            },
            where(..._args: unknown[]) {
              call.where = _args;
              // where() returns something that supports .orderBy() and .limit()
              // and is also directly thenable (awaitable)
              return {
                orderBy(..._a: unknown[]) {
                  call.orderBy = _a;
                  return makeTerminal();
                },
                ...makeTerminal(),
              };
            },
            orderBy(..._args: unknown[]) {
              call.orderBy = _args;
              return makeTerminal();
            },
            limit(_n: number) {
              call.limit = _n;
              return Promise.resolve(result());
            },
            // Allow direct await on from() (no where)
            then: (resolve: any) => resolve(result()),
          };
          return selectChain;
        },
      };
      return chain;
    },

    insert(_table: unknown) {
      const idx = db._calls.insert.length;
      const call: Record<string, unknown> = { table: _table };
      db._calls.insert.push(call);
      const result = () => db._results.insert[idx] ?? [];

      const returningChain = {
        returning() {
          return Promise.resolve(result());
        },
        onConflictDoUpdate(_config: unknown) {
          call.onConflictDoUpdate = _config;
          return { returning: () => Promise.resolve(result()) };
        },
        onConflictDoNothing() {
          call.onConflictDoNothing = true;
          return { returning: () => Promise.resolve(result()) };
        },
      };
      return {
        values(_v: unknown) {
          call.values = _v;
          return returningChain;
        },
      } as any;
    },

    update(_table: unknown) {
      const idx = db._calls.update.length;
      const call: Record<string, unknown> = { table: _table };
      db._calls.update.push(call);
      const result = () => db._results.update[idx] ?? [];

      return {
        set(_v: unknown) {
          call.set = _v;
          const whereChain: any = {
            where(..._args: unknown[]) {
              call.where = _args;
              const p = Promise.resolve(result());
              (p as any).returning = () => Promise.resolve(result());
              return p;
            },
            returning() {
              return Promise.resolve(result());
            },
          };
          return whereChain;
        },
      } as any;
    },

    delete(_table: unknown) {
      const idx = db._calls.delete.length;
      db._calls.delete.push({});

      return {
        where(..._args: unknown[]) {
          return Promise.resolve();
        },
      } as any;
    },

    execute<T = unknown>(_sql: unknown) {
      const idx = db._calls.execute.length;
      db._calls.execute.push({});
      return Promise.resolve((db._results.execute[idx] ?? []) as T[]);
    },

    transaction<T>(callback: (tx: MockDb) => Promise<T>) {
      return callback(db);
    },
  };

  return db;
}

// Global type declarations for CommonJS compatibility
declare var __filename: string;
declare var __dirname: string;
declare var window: undefined;
declare var global: NodeJS.Global & {
  __filename: string;
  __dirname: string;
};

// Declare better-sqlite3 methods to return any to avoid TypeScript errors
declare module 'better-sqlite3' {
  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): void;
    pragma(pragma: string, value?: string | number): any;
    close(): void;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    inTransaction: boolean;
  }

  interface Statement {
    run(...params: any[]): RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
    iterate(...params: any[]): Iterator<any>;
    pluck(toggle?: boolean): Statement;
    expand(toggle?: boolean): Statement;
    raw(toggle?: boolean): Statement;
    columns(): ColumnDefinition[];
    database: Database;
    source: string;
    name: string;
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface ColumnDefinition {
    name: string;
    type: string;
    column?: string;
    table?: string;
    database?: string;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Options): Database;
    (filename: string, options?: Options): Database;
  }

  interface Options {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (sql: string) => void;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
// Helper function to generate CREATE TABLE SQL from column definitions
export function generateCreateTableSQL(tableName: string, columns: readonly ColumnDefinition[]): string {
  const columnDefinitions = columns
    .map(col => {
      let definition = `${col.name} ${col.dbType}`;

      if (col.primaryKey) definition += ' PRIMARY KEY';
      if (col.autoIncrement) definition += ' AUTOINCREMENT';
      if (col.nullable === false) definition += ' NOT NULL';
      if (col.unique) definition += ' UNIQUE';
      if (col.defaultValue !== undefined) {
        if (typeof col.defaultValue === 'string' && col.defaultValue !== 'CURRENT_TIMESTAMP') {
          definition += ` DEFAULT '${col.defaultValue}'`;
        } else {
          definition += ` DEFAULT ${col.defaultValue}`;
        }
      }

      return definition;
    })
    .join(',\n      ');

  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n      ${columnDefinitions}\n    )`;
}

export interface ColumnDefinition {
  name: string;
  dbType: SQLiteColumnType;
  nullable?: false;
  defaultValue?: string | number;
  unique?: boolean;
  primaryKey?: true;
  autoIncrement?: true;
  isBoolean?: true;
  isPercentage?: true;
  /** true if this column should not be imported from the Nor-Customs CSV file */
  skipImport?: true;
}

export enum SQLiteColumnType {
  TEXT = 'TEXT',
  INTEGER = 'INTEGER',
  REAL = 'REAL',
  DATETIME = 'DATETIME',
}

type PrimitiveFromDbType<T extends SQLiteColumnType> = T extends SQLiteColumnType.INTEGER | SQLiteColumnType.REAL
  ? number
  : T extends SQLiteColumnType.TEXT | SQLiteColumnType.DATETIME
  ? string
  : never;

// Generic type to create an interface from a schema array
export type InterfaceFromSchema<T extends readonly ColumnDefinition[]> = {
  [Item in T[number] as Item extends { skipImport: true } ? never : Item['name']]: PrimitiveFromDbType<Item['dbType']>;
};

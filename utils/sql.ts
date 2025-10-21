// Helper function to generate CREATE TABLE SQL from column definitions
export function generateCreateTableSQL(tableName: string, columns: ColumnDefinition[]): string {
  const columnDefinitions = columns
    .map(col => {
      let definition = `${col.name} ${col.type}`;

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
  type: SQLiteColumnType;
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

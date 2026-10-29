export interface ColumnDefinition {
  name: string
  dbType: SQLiteColumnType
  nullable?: false
  defaultValue?: string | number
  unique?: boolean
  primaryKey?: true
  autoIncrement?: true
  isBoolean?: true
  isPercentage?: true
  /** true if this column should not be imported from the Customs Cruncher CSV file */
  skipImport?: true
  importToPlayer?: true
}

export enum SQLiteColumnType {
  TEXT = 'TEXT',
  INTEGER = 'INTEGER',
  REAL = 'REAL',
  DATETIME = 'DATETIME',
}

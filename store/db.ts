import Database from 'better-sqlite3'

export const db = new Database('./store/nor_customs.db')

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

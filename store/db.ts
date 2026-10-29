import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config()

const isProd = process.env.NODE_ENV === 'production'
const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL_DEV

if (!connectionString) {
  throw new Error(
    `Missing database connection string: expected ${isProd ? 'DATABASE_URL_PROD' : 'DATABASE_URL_DEV'} to be set in .env`
  )
}

export const sql = postgres(connectionString, { onnotice: () => {} })

export const db = sql

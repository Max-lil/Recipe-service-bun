import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const {
  DATABASE_URL,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  CLOUD_SQL_CONNECTION_NAME,
} = process.env;

export const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL })
  : new Pool({
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      host: `/cloudsql/${CLOUD_SQL_CONNECTION_NAME}`,
    });

export const db = drizzle(pool);

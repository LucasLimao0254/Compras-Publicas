const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';

export const TEST_DB_NAME = 'compras_test';
export const TEST_ADMIN_URL = ADMIN_URL;
export const TEST_DB_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB_NAME}`);

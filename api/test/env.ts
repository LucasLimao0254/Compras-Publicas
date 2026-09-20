import { TEST_DB_URL } from './config';

// Garante que nada nos testes (nem um ConfigService, nem um script) caia no
// banco de desenvolvimento por engano.
process.env.DATABASE_URL = TEST_DB_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'teste-jwt-secret';

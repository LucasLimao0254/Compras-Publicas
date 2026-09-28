import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PostgresExceptionFilter } from './common/postgres-exception.filter';

// JWT_SECRET é obrigatório em qualquer ambiente — sem fallback hardcoded no
// código (ver AuthModule/JwtStrategy, que recusam subir sem ela). Não há mais
// checagem aqui porque a própria criação do AppModule já falha nesse caso.
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Ambiente hospedado de um serviço só (render.yaml): a API responde em
  // /api — o mesmo caminho que o frontend já usa, e que o Vite reescreve em
  // desenvolvimento — e serve o build do frontend em todo o resto, com
  // fallback para index.html nas rotas do React Router (/contratos etc.).
  // Sem SERVIR_FRONTEND, nada muda: a API continua na raiz, como em dev.
  const frontend = process.env.SERVIR_FRONTEND;
  if (frontend) {
    app.setGlobalPrefix('api');
    if (process.env.ARQUIVOS_TESTE_DIR) app.useStaticAssets(process.env.ARQUIVOS_TESTE_DIR, { prefix: '/arquivos-teste/' });
    app.useStaticAssets(frontend, { index: false });
    app.use((req: any, res: any, next: () => void) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/') && !extname(req.path)) return res.sendFile(join(frontend, 'index.html'));
      next();
    });
  }

  // Sem CORS_ORIGIN definida, libera qualquer origem (conveniente em dev);
  // em produção, defina CORS_ORIGIN com o(s) domínio(s) do frontend.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors(corsOrigin ? { origin: corsOrigin.split(',').map((o) => o.trim()) } : undefined);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PostgresExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`API rodando em http://localhost:${port}`);
}
bootstrap();

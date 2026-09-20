import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PostgresExceptionFilter } from './common/postgres-exception.filter';

// JWT_SECRET é obrigatório em qualquer ambiente — sem fallback hardcoded no
// código (ver AuthModule/JwtStrategy, que recusam subir sem ela). Não há mais
// checagem aqui porque a própria criação do AppModule já falha nesse caso.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

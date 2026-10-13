import { ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Traduz violações de constraint única (23505) e de chave estrangeira (23503)
// do Postgres, que escapariam como 500 genérico, para um 409 com mensagem
// legível. Qualquer outro erro segue para o comportamento padrão do Nest.
// O drizzle-orm (0.44+) embrulha o erro do driver num DrizzleQueryError e o
// código SQLSTATE fica em `cause.code` — ler só `exception.code` fazia este
// filtro nunca disparar (duplicata virava 500). Olha nos dois lugares.
export function codigoPostgres(erro: unknown): string | undefined {
  if (!erro || typeof erro !== 'object') return undefined;
  const e = erro as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e.code === 'string') return e.code;
  if (typeof e.cause?.code === 'string') return e.cause.code;
  return undefined;
}

@Catch()
export class PostgresExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const code = codigoPostgres(exception);
    if (code === '23505') {
      return super.catch(new ConflictException('Já existe um registro com esses dados'), host);
    }
    // 23503 = chave estrangeira: apagar algo que ainda é referenciado (ex.:
    // lote com itens) ou apontar para algo inexistente. Antes virava 500.
    if (code === '23503') {
      return super.catch(new ConflictException('Operação não permitida: o registro está vinculado a outros dados'), host);
    }
    super.catch(exception, host);
  }
}

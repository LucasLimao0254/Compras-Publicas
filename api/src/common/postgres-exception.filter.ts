import { ArgumentsHost, BadRequestException, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Código SQLSTATE do erro do Postgres. O Drizzle embrulha o erro do driver
// num DrizzleQueryError ("Failed query: ...") e deixa o original em `.cause`
// — olhar só `exception.code` nunca casava, e toda violação de constraint
// escapava como 500 genérico.
function codigoPostgres(exception: unknown): string | undefined {
  let atual: any = exception;
  for (let i = 0; i < 4 && atual && typeof atual === 'object'; i++) {
    if (typeof atual.code === 'string' && /^[0-9A-Z]{5}$/.test(atual.code)) return atual.code;
    atual = atual.cause;
  }
  return undefined;
}

// Traduz os erros de constraint/entrada do Postgres que chegam até aqui para
// respostas legíveis; qualquer outro erro segue para o comportamento padrão
// do Nest.
// - 23505 (unique): registro duplicado → 409
// - 23503 (foreign key): excluir algo ainda referenciado, ou referenciar algo
//   que não existe → 409
// - 22P02 (invalid text representation): id que não é UUID, valor fora do
//   enum, número malformado vindo de query string → 400
@Catch()
export class PostgresExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const codigo = codigoPostgres(exception);
    if (codigo === '23505') {
      return super.catch(new ConflictException('Já existe um registro com esses dados'), host);
    }
    if (codigo === '23503') {
      return super.catch(new ConflictException('Este registro está vinculado a outros dados do sistema e não pode ser excluído nem alterado desta forma'), host);
    }
    if (codigo === '22P02') {
      return super.catch(new BadRequestException('Identificador ou filtro em formato inválido'), host);
    }
    super.catch(exception, host);
  }
}

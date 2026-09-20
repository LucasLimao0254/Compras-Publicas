import { ArgumentsHost, Catch, ConflictException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Traduz violações de constraint única do Postgres (código 23505), que hoje
// escapam como 500 genérico, para um 409 com mensagem legível. Só intercepta
// esse código — qualquer outro erro segue para o comportamento padrão do Nest.
@Catch()
export class PostgresExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception && typeof exception === 'object' && (exception as { code?: string }).code === '23505') {
      return super.catch(new ConflictException('Já existe um registro com esses dados'), host);
    }
    super.catch(exception, host);
  }
}

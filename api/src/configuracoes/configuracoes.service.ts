import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { configuracoesCompras, contadores, ordens } from '../db/schema';
import { UpdateConfiguracoesComprasDto } from './dto/configuracoes.dto';

@Injectable()
export class ConfiguracoesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  // Singleton por tenant: cria a linha com os defaults na primeira leitura,
  // em vez de exigir um passo de setup separado. proximoNumeroOrdem não é
  // uma coluna própria aqui — é um espelho do contador que OrdensService já
  // usa (`contadores.proximaOrdem`), para não ter duas fontes de verdade
  // para o mesmo sequencial.
  async getOuCriar(tenantId: string) {
    let [row] = await this.db.select().from(configuracoesCompras).where(eq(configuracoesCompras.tenantId, tenantId));
    if (!row) {
      [row] = await this.db.insert(configuracoesCompras).values({ tenantId }).returning();
    }
    const [contador] = await this.db.select().from(contadores).where(eq(contadores.tenantId, tenantId));
    return { ...row, proximoNumeroOrdem: contador?.proximaOrdem ?? 1 };
  }

  async update(tenantId: string, dto: UpdateConfiguracoesComprasDto) {
    await this.getOuCriar(tenantId); // garante que a linha do singleton existe

    const patch: Record<string, unknown> = {};
    if (dto.permitirOrdemContratoVencido !== undefined) patch.permitirOrdemContratoVencido = dto.permitirOrdemContratoVencido;
    if (dto.dotacaoObrigatoria !== undefined) patch.dotacaoObrigatoria = dto.dotacaoObrigatoria;
    if (Object.keys(patch).length) {
      await this.db.update(configuracoesCompras).set(patch).where(eq(configuracoesCompras.tenantId, tenantId));
    }

    if (dto.proximoNumeroOrdem !== undefined) {
      // O número é único por tenant: recuar o sequencial para um valor já
      // usado fazia TODA emissão seguinte falhar até alguém corrigir aqui.
      const [maior] = await this.db.select({ numero: sql<number | null>`max(${ordens.numero})` }).from(ordens).where(eq(ordens.tenantId, tenantId));
      const maiorUsado = Number(maior?.numero ?? 0);
      if (dto.proximoNumeroOrdem <= maiorUsado) {
        throw new BadRequestException(`O próximo número de ordem precisa ser maior que ${maiorUsado}, o maior número já emitido neste município`);
      }
      const [contador] = await this.db.select().from(contadores).where(eq(contadores.tenantId, tenantId));
      if (contador) {
        await this.db.update(contadores).set({ proximaOrdem: dto.proximoNumeroOrdem }).where(eq(contadores.tenantId, tenantId));
      } else {
        await this.db.insert(contadores).values({ tenantId, proximaOrdem: dto.proximoNumeroOrdem });
      }
    }

    return this.getOuCriar(tenantId);
  }
}

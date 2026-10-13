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
    return { ...row, proximoNumeroOrdem: contador?.proximaOrdem ?? 1, ultimoNumeroEmitido: await this.ultimoNumeroEmitido(tenantId) };
  }

  // Maior número de ordem já usado — a tela mostra ao lado do sequencial, já
  // que o próximo precisa ser maior que ele.
  private async ultimoNumeroEmitido(tenantId: string): Promise<number | null> {
    const [{ maior }] = await this.db.select({ maior: sql<number | null>`max(${ordens.numero})` }).from(ordens).where(eq(ordens.tenantId, tenantId));
    return maior == null ? null : Number(maior);
  }

  async update(tenantId: string, dto: UpdateConfiguracoesComprasDto) {
    await this.getOuCriar(tenantId); // garante que a linha do singleton existe

    // O sequencial é editável (MODELO.md, seção 6), mas não pode voltar para
    // um número já usado — a próxima emissão bateria na UNIQUE (tenant,
    // numero) e ninguém conseguiria emitir ordem até alguém corrigir.
    if (dto.proximoNumeroOrdem !== undefined) {
      const maior = await this.ultimoNumeroEmitido(tenantId);
      if (maior != null && dto.proximoNumeroOrdem <= maior) {
        throw new BadRequestException(`O próximo número de ordem precisa ser maior que o último já emitido (${maior})`);
      }
    }

    const patch: Record<string, unknown> = {};
    if (dto.permitirOrdemContratoVencido !== undefined) patch.permitirOrdemContratoVencido = dto.permitirOrdemContratoVencido;
    if (dto.dotacaoObrigatoria !== undefined) patch.dotacaoObrigatoria = dto.dotacaoObrigatoria;
    if (Object.keys(patch).length) {
      await this.db.update(configuracoesCompras).set(patch).where(eq(configuracoesCompras.tenantId, tenantId));
    }

    if (dto.proximoNumeroOrdem !== undefined) {
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

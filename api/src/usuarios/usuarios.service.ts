import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { permissoes, usuarios } from '../db/schema';
import { CreateUsuarioDto, UpdateUsuarioDto } from './dto/usuario.dto';
import { codigoPostgres } from '../common/postgres-exception.filter';
import { cpfValido, nomePessoaValido, normalizarCpf } from '../common/documentos';

// Quem está chamando — o módulo inteiro é gated por 'administrativo.usuarios',
// mas essa permissão pode ser concedida a um usuário PADRAO. Sem checar o
// tipo de quem chama, esse usuário podia se promover (ou criar outro) a
// ADMIN, ou redefinir a senha de um ADMIN e assumir a conta dele.
export interface ChamadorUsuarios {
  tipoUsuario: 'ADMIN' | 'PADRAO';
  ehAdminPlataforma: boolean;
  userId?: string;
  permissoes?: string[];
}

@Injectable()
export class UsuariosService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async list(tenantId: string) {
    const rows = await this.db.select().from(usuarios).where(eq(usuarios.tenantId, tenantId));
    return rows.map(({ senhaHash, ...rest }) => rest);
  }

  async get(tenantId: string, id: string) {
    const [user] = await this.db.select().from(usuarios).where(and(eq(usuarios.tenantId, tenantId), eq(usuarios.id, id)));
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const perms = await this.db.select().from(permissoes).where(eq(permissoes.usuarioId, id));
    const { senhaHash, ...rest } = user;
    return { ...rest, permissoes: perms.map((p) => p.recurso) };
  }

  // CPF é a identidade da pessoa entre tenants (ver AuthService.trocarTenant)
  // — sem essa checagem, qualquer admin de tenant poderia criar um usuário
  // com o CPF de outra pessoa em outro tenant e, via troca de tenant, assumir
  // a sessão dela (inclusive virando admin de plataforma se o CPF copiado for
  // o de um). Só um admin de plataforma pode "vincular" um CPF já usado em
  // outro tenant — criar usuários dentro do próprio tenant continua livre.
  private async validarCpfEntreTenants(tenantId: string, cpf: string, callerEhAdminPlataforma: boolean) {
    if (callerEhAdminPlataforma) return;
    const outros = await this.db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.cpf, cpf), ne(usuarios.tenantId, tenantId)));
    if (outros.length) {
      throw new BadRequestException('Este CPF já está cadastrado em outro município — só um administrador de plataforma pode vincular a mesma pessoa a mais de um tenant');
    }
  }

  // Só um ADMIN do tenant concede ou altera o tipo ADMIN, e só ele mexe
  // (edita, troca senha, remove) em outro ADMIN.
  private exigirAdminPara(chamador: ChamadorUsuarios, acao: string) {
    if (chamador.tipoUsuario !== 'ADMIN') {
      throw new ForbiddenException(`Somente administradores do tenant podem ${acao}`);
    }
  }

  // Quem não é ADMIN só repassa permissões que ele mesmo tem — sem isso, um
  // usuário com acesso a Usuários dava a si (ou a um colega) acesso a todas as
  // telas. E ninguém que não seja ADMIN altera as próprias permissões.
  private validarConcessao(chamador: ChamadorUsuarios, alvoId: string | null, permissoesNovas: string[] | undefined, permissoesAtuais: string[] = []) {
    if (!permissoesNovas || chamador.tipoUsuario === 'ADMIN') return;
    if (alvoId && alvoId === chamador.userId) {
      const mudou = permissoesNovas.length !== permissoesAtuais.length || permissoesNovas.some((p) => !permissoesAtuais.includes(p));
      if (mudou) throw new ForbiddenException('Você não pode alterar as próprias permissões — peça a um administrador');
    }
    if (!chamador.permissoes) return;
    const acrescentadas = permissoesNovas.filter((p) => !permissoesAtuais.includes(p));
    const semPoder = acrescentadas.filter((p) => !chamador.permissoes!.includes(p));
    if (semPoder.length) throw new ForbiddenException(`Você só pode conceder permissões que você mesmo tem (sem acesso a: ${semPoder.join(', ')})`);
  }

  // O município nunca pode ficar sem um administrador ativo — senão ninguém
  // mais cria usuários, sobe modelos de minuta ou exclui registros.
  private async exigirOutroAdminAtivo(tenantId: string, alvoId: string) {
    const outros = await this.db.select({ id: usuarios.id }).from(usuarios)
      .where(and(eq(usuarios.tenantId, tenantId), eq(usuarios.tipoUsuario, 'ADMIN'), eq(usuarios.ativo, true), ne(usuarios.id, alvoId)));
    if (!outros.length) throw new BadRequestException('Este é o único administrador ativo do município — promova outro usuário a administrador antes');
  }

  async create(tenantId: string, chamador: ChamadorUsuarios, dto: CreateUsuarioDto) {
    if (dto.tipoUsuario === 'ADMIN') this.exigirAdminPara(chamador, 'criar um usuário administrador');
    this.validarConcessao(chamador, null, dto.permissoes);
    if (!cpfValido(dto.cpf)) throw new BadRequestException('CPF inválido — informe os 11 dígitos de um CPF válido');
    if (!nomePessoaValido(dto.nome)) throw new BadRequestException('Nome inválido — use apenas letras, sem números');
    dto = { ...dto, cpf: normalizarCpf(dto.cpf), nome: dto.nome.trim() };

    const existing = await this.db
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.tenantId, tenantId), eq(usuarios.email, dto.email)));
    if (existing.length) throw new ConflictException('Já existe um usuário com este e-mail neste município');

    await this.validarCpfEntreTenants(tenantId, dto.cpf, chamador.ehAdminPlataforma);

    const senhaHash = await bcrypt.hash(dto.senha, 10);
    const [created] = await this.db
      .insert(usuarios)
      .values({
        tenantId,
        cpf: dto.cpf,
        nome: dto.nome,
        email: dto.email,
        senhaHash,
        telefone: dto.telefone,
        tipoUsuario: dto.tipoUsuario ?? 'PADRAO',
        ativo: dto.ativo ?? true,
      })
      .returning();

    if (dto.permissoes?.length) {
      await this.db.insert(permissoes).values(
        dto.permissoes.map((recurso) => ({ usuarioId: created.id, recurso, permitido: true })),
      );
    }

    return this.get(tenantId, created.id);
  }

  async update(tenantId: string, chamador: ChamadorUsuarios, id: string, dto: UpdateUsuarioDto) {
    const alvo = await this.get(tenantId, id); // garante que existe e pertence ao tenant
    if (alvo.tipoUsuario === 'ADMIN') this.exigirAdminPara(chamador, 'alterar um usuário administrador');
    if (dto.tipoUsuario !== undefined && dto.tipoUsuario !== alvo.tipoUsuario) this.exigirAdminPara(chamador, 'alterar o tipo de um usuário');
    this.validarConcessao(chamador, id, dto.permissoes, alvo.permissoes);
    const desativa = dto.ativo === false && alvo.ativo;
    const rebaixa = dto.tipoUsuario === 'PADRAO' && alvo.tipoUsuario === 'ADMIN';
    if (id === chamador.userId && (desativa || rebaixa)) {
      throw new BadRequestException(desativa ? 'Você não pode desativar o próprio usuário' : 'Você não pode tirar de si mesmo o tipo Administrador');
    }
    if (alvo.tipoUsuario === 'ADMIN' && alvo.ativo && (desativa || rebaixa)) await this.exigirOutroAdminAtivo(tenantId, id);

    const patch: Record<string, unknown> = {};
    if (dto.nome !== undefined) {
      if (!nomePessoaValido(dto.nome)) throw new BadRequestException('Nome inválido — use apenas letras, sem números');
      patch.nome = dto.nome.trim();
    }
    if (dto.telefone !== undefined) patch.telefone = dto.telefone;
    if (dto.ativo !== undefined) patch.ativo = dto.ativo;
    if (dto.tipoUsuario !== undefined) patch.tipoUsuario = dto.tipoUsuario;
    if (dto.senha) patch.senhaHash = await bcrypt.hash(dto.senha, 10);

    if (Object.keys(patch).length) {
      await this.db.update(usuarios).set(patch).where(and(eq(usuarios.id, id), eq(usuarios.tenantId, tenantId)));
    }

    if (dto.permissoes) {
      await this.db.delete(permissoes).where(eq(permissoes.usuarioId, id));
      if (dto.permissoes.length) {
        await this.db.insert(permissoes).values(
          dto.permissoes.map((recurso) => ({ usuarioId: id, recurso, permitido: true })),
        );
      }
    }

    return this.get(tenantId, id);
  }

  async remove(tenantId: string, chamador: ChamadorUsuarios, id: string) {
    const alvo = await this.get(tenantId, id);
    if (alvo.tipoUsuario === 'ADMIN') this.exigirAdminPara(chamador, 'remover um usuário administrador');
    if (id === chamador.userId) throw new BadRequestException('Você não pode excluir o próprio usuário');
    if (alvo.tipoUsuario === 'ADMIN' && alvo.ativo) await this.exigirOutroAdminAtivo(tenantId, id);
    try {
      await this.db.delete(usuarios).where(and(eq(usuarios.id, id), eq(usuarios.tenantId, tenantId)));
    } catch (err) {
      // 23503 = violação de chave estrangeira: o usuário é autor de eventos
      // (histórico de ordens, prorrogações, remanejamentos, apostilamentos…)
      // que precisam continuar apontando para ele. Apagar quebraria a
      // auditoria; o caminho é desativar.
      if (codigoPostgres(err) === '23503') {
        throw new BadRequestException('Este usuário tem registros no histórico e não pode ser excluído — desative-o em vez disso');
      }
      throw err;
    }
    return { ok: true };
  }
}

import {
  pgTable, text, integer, boolean, timestamp, numeric, pgEnum, unique, uuid, jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------- ENUMS ----------
export const tipoUsuarioEnum = pgEnum('tipo_usuario', ['ADMIN', 'PADRAO']);
export const formaFaturamentoEnum = pgEnum('forma_faturamento', [
  'MENSAL', 'POR_MEDICAO', 'POR_ETAPA', 'POR_ENTREGA', 'SOB_DEMANDA', 'PARCELA_UNICA', 'PAGAMENTO_ANTECIPADO',
]);
export const formaControleSaldoEnum = pgEnum('forma_controle_saldo', [
  'NORMAL', 'APENAS_VALOR_TOTAL', 'QTD_VALOR_VARIAVEL',
]);
export const tipoContratoEnum = pgEnum('tipo_contrato', [
  'ORIGINAL', 'ADITIVO_ACRESCIMO_25', 'ADITIVO_SUPRESSAO_25', 'ADITIVO_ACRESCIMO_50', 'ADITIVO_RENOVACAO',
]);
export const situacaoContratoEnum = pgEnum('situacao_contrato', ['MINUTA', 'VIGENTE', 'ARQUIVADO']);
export const modalidadeLicitacaoEnum = pgEnum('modalidade_licitacao', [
  'PREGAO_PRESENCIAL', 'CONCORRENCIA_PUBLICA', 'DISPENSA', 'INEXIGIBILIDADE', 'CARTA_CONVITE',
  'PREGAO_ELETRONICO', 'CHAMAMENTO_PUBLICO', 'LEILAO', 'CONCURSO', 'ADESAO_ATA', 'RDC_PRESENCIAL', 'DIALOGO_COMPETITIVO',
]);
// REQUISICAO é um rascunho: ainda não valida/decrementa saldo — só EMITIDA
// (seja direto em create() ou depois via POST /ordens/:id/emitir) consome.
export const statusOrdemEnum = pgEnum('status_ordem', ['REQUISICAO', 'EMITIDA', 'CANCELADA']);
export const statusAssinaturasEnum = pgEnum('status_assinaturas', ['nao_iniciado', 'em_andamento', 'concluido']);
export const tipoEventoHistoricoEnum = pgEnum('tipo_evento_historico', ['cadastrou', 'emitiu_ordem', 'assinatura_concluida', 'cancelou', 'editou_ordem']);
export const tipoAtaEnum = pgEnum('tipo_ata', ['ATAS', 'CREDENCIAMENTO']);
export const situacaoAtaEnum = pgEnum('situacao_ata', ['VIGENTE', 'ARQUIVADO']);
export const perfilOrgaoAtaEnum = pgEnum('perfil_orgao_ata', ['GERENCIADOR', 'PARTICIPANTE']);
// ACRESCIMO_ESPECIAL: Art. 65 §1º-B (obras de reforma de edifício/equipamento) —
// teto próprio de 50%, pool inteiramente separado do teto de 25% compartilhado
// entre VALOR/QUANTIDADE (ver AditivosService.somaAcrescimos).
export const tipoAditivoEnum = pgEnum('tipo_aditivo', ['VALOR', 'PRAZO', 'QUANTIDADE', 'SUPRESSAO', 'ACRESCIMO_ESPECIAL']);
export const homologacaoStatusEnum = pgEnum('homologacao_status', ['processando', 'pronto_para_revisao', 'revisado', 'erro']);
export const confiancaExtracaoEnum = pgEnum('confianca_extracao', ['alta', 'media', 'baixa']);
// Apostilamento (Lei 14.133/2021, art. 136): registro formal sem efeito de
// saldo — ao contrário de aditivo, nunca altera quantidade/valor de item.
export const tipoApostilamentoEnum = pgEnum('tipo_apostilamento', [
  'REAJUSTE_REPACTUACAO', 'ATUALIZACAO_FINANCEIRA', 'ALTERACAO_RAZAO_SOCIAL', 'EMPENHO_DOTACAO',
]);

// ---------- TABELAS ----------
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  codigo: integer('codigo').notNull().unique(),
  nome: text('nome').notNull(),
  // Rótulo livre pro seletor de tenant ("Prefeitura Municipal" / "Câmara
  // Municipal") — sem enum de propósito, é só texto de exibição.
  tipo: text('tipo'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// cpf é a identidade da pessoa física entre tenants neste MVP (ver
// AuthService.tenantsDisponiveis/trocarTenant) — a mesma pessoa pode ter uma
// linha de usuário por tenant a que pertence, ligadas só pelo CPF em comum
// (decisão deliberada: mais simples que uma tabela de vínculo pessoa↔tenant,
// e consistente com CPF já ser usado como chave natural no resto do sistema).
export const usuarios = pgTable('usuarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  cpf: text('cpf').notNull(),
  nome: text('nome').notNull(),
  email: text('email').notNull(),
  senhaHash: text('senha_hash').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  tipoUsuario: tipoUsuarioEnum('tipo_usuario').notNull().default('PADRAO'),
  telefone: text('telefone'),
  // Acima da hierarquia de tenant — desbloqueia as telas de nível plataforma
  // (ver PlatformAdminGuard). Continua sendo uma linha tenant-scoped normal
  // (precisa de um tenant "casa" pra logar); o flag só muda o que o JWT libera.
  ehAdminPlataforma: boolean('eh_admin_plataforma').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqEmail: unique().on(t.tenantId, t.email),
  uniqCpf: unique().on(t.tenantId, t.cpf),
}));

export const permissoes = pgTable('permissoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  recurso: text('recurso').notNull(),
  permitido: boolean('permitido').notNull().default(true),
}, (t) => ({
  uniqRecurso: unique().on(t.usuarioId, t.recurso),
}));

export const secretarias = pgTable('secretarias', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  titulo: text('titulo').notNull(),
  codigoUnidadePncp: text('codigo_unidade_pncp'),
});

export const fornecedores = pgTable('fornecedores', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  cnpjCpf: text('cnpj_cpf').notNull(),
  razaoSocial: text('razao_social').notNull(),
}, (t) => ({
  uniqCnpj: unique().on(t.tenantId, t.cnpjCpf),
}));

export const licitacoes = pgTable('licitacoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  numero: text('numero').notNull(),
  numeroProcesso: text('numero_processo').notNull(),
  objeto: text('objeto').notNull(),
  modalidade: modalidadeLicitacaoEnum('modalidade').notNull(),
  srp: boolean('srp').notNull().default(false),
  credenciamento: boolean('credenciamento').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqNumero: unique().on(t.tenantId, t.numero),
}));

// Upload de planilha .xlsx de homologação → extração determinística → revisão
// humana obrigatória. Tabelas de "rascunho" até 'revisado' — depois disso,
// homologacaoItens.quantidade vira o teto fixo por fornecedor/item que Ata e
// Contrato referenciam via homologacaoItemId e abatem em cascata (ver
// SaldoCeilingService, atas.homologacaoFornecedorId, contratos.ataOrgaoId/
// homologacaoFornecedorId). Ver CLAUDE.md, seção "Homologação de licitação".
export const licitacaoHomologacoes = pgTable('licitacao_homologacoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  licitacaoId: uuid('licitacao_id').notNull().references(() => licitacoes.id, { onDelete: 'cascade' }),
  arquivoNome: text('arquivo_nome').notNull(),
  arquivoPath: text('arquivo_path').notNull(),
  tamanhoBytes: integer('tamanho_bytes').notNull(),
  enviadoPor: uuid('enviado_por').notNull().references(() => usuarios.id),
  enviadoEm: timestamp('enviado_em').defaultNow().notNull(),
  status: homologacaoStatusEnum('status').notNull().default('processando'),
  erroDetalhe: text('erro_detalhe'),
});

export const homologacaoFornecedores = pgTable('homologacao_fornecedores', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  homologacaoId: uuid('homologacao_id').notNull().references(() => licitacaoHomologacoes.id, { onDelete: 'cascade' }),
  nomeExtraido: text('nome_extraido').notNull(),
  cnpjExtraido: text('cnpj_extraido'),
  fornecedorId: uuid('fornecedor_id').references(() => fornecedores.id),
});

// Campos numéricos e unidade nullable de propósito — a extração pode vir
// incompleta, e é a tela de revisão que obriga preencher o que falta antes de
// liberar o fornecedor/homologação para import (ver concluirRevisao()).
// A partir do momento em que a homologação-mãe vira status 'revisado', esta
// linha é o TETO FIXO daquele item para aquele fornecedor — nunca mais editável
// (ver guarda em LicitacoesHomologacaoService.patchItem) — e passa a ser
// referenciada por ataItens.homologacaoItemId / itensContrato.homologacaoItemId
// como a raiz da cadeia de abatimento em cascata.
export const homologacaoItens = pgTable('homologacao_itens', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  homologacaoFornecedorId: uuid('homologacao_fornecedor_id').notNull().references(() => homologacaoFornecedores.id, { onDelete: 'cascade' }),
  numeroItem: integer('numero_item'),
  descricao: text('descricao').notNull(),
  unidade: text('unidade'),
  quantidade: numeric('quantidade', { precision: 14, scale: 3 }),
  valorUnitario: numeric('valor_unitario', { precision: 14, scale: 4 }),
  valorTotal: numeric('valor_total', { precision: 14, scale: 2 }),
  confiancaExtracao: confiancaExtracaoEnum('confianca_extracao'),
});

// ataOrgaoId/homologacaoFornecedorId: de onde este contrato abate saldo, quando
// vem da cadeia de homologação — no máximo um dos dois preenchido (regra de
// aplicação, checada em ContratosService.create, mesmo padrão já usado para a
// origem polimórfica de ordens.contratoId/ordens.ataOrgaoId). Ambos nulos =
// contrato manual/legado, fora da cadeia, comportamento inalterado. Imutável
// depois de criado — nunca exposto em UpdateContratoDto.
export const contratos = pgTable('contratos', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  tipo: tipoContratoEnum('tipo').notNull().default('ORIGINAL'),
  numero: text('numero').notNull(),
  numeroProcesso: text('numero_processo').notNull(),
  objeto: text('objeto').notNull(),
  licitacaoId: uuid('licitacao_id').notNull().references(() => licitacoes.id),
  orgaoGerenciadorId: uuid('orgao_gerenciador_id').notNull().references(() => secretarias.id),
  fornecedorId: uuid('fornecedor_id').notNull().references(() => fornecedores.id),
  fiscalId: uuid('fiscal_id').references(() => usuarios.id),
  ataOrgaoId: uuid('ata_orgao_id').references(() => ataOrgaos.id),
  homologacaoFornecedorId: uuid('homologacao_fornecedor_id').references(() => homologacaoFornecedores.id),
  dataAssinatura: timestamp('data_assinatura'),
  vigenciaInicial: timestamp('vigencia_inicial').notNull(),
  vigenciaFinal: timestamp('vigencia_final').notNull(),
  formaFaturamento: formaFaturamentoEnum('forma_faturamento').notNull().default('SOB_DEMANDA'),
  formaControleSaldo: formaControleSaldoEnum('forma_controle_saldo').notNull().default('NORMAL'),
  valorOriginal: numeric('valor_original', { precision: 14, scale: 2 }).notNull().default('0'),
  situacao: situacaoContratoEnum('situacao').notNull().default('MINUTA'),
  contratoOriginalId: uuid('contrato_original_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqNumero: unique().on(t.tenantId, t.numero),
}));

export const itensContrato = pgTable('itens_contrato', {
  id: uuid('id').defaultRandom().primaryKey(),
  contratoId: uuid('contrato_id').notNull().references(() => contratos.id, { onDelete: 'cascade' }),
  numero: integer('numero').notNull(),
  descricao: text('descricao').notNull(),
  unidade: text('unidade').notNull(),
  quantidade: numeric('quantidade', { precision: 14, scale: 3 }).notNull(),
  valorUnitario: numeric('valor_unitario', { precision: 14, scale: 4 }).notNull(),
  // Rastreia de qual item-mestre da homologação esta linha puxa saldo — null
  // para itens de contratos manuais/legados, fora da cadeia de abatimento.
  homologacaoItemId: uuid('homologacao_item_id').references(() => homologacaoItens.id),
}, (t) => ({
  uniqNumero: unique().on(t.contratoId, t.numero),
}));

// Registro formal (Lei 14.133/2021, art. 136) — nunca mexe em saldo/quantidade,
// ao contrário de aditivo. Sem transação/validação de teto no service.
export const contratoApostilamentos = pgTable('contrato_apostilamentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  contratoId: uuid('contrato_id').notNull().references(() => contratos.id, { onDelete: 'cascade' }),
  tipo: tipoApostilamentoEnum('tipo').notNull(),
  descricao: text('descricao').notNull(),
  valorAnterior: numeric('valor_anterior', { precision: 14, scale: 2 }),
  valorNovo: numeric('valor_novo', { precision: 14, scale: 2 }),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
  criadoPor: uuid('criado_por').notNull().references(() => usuarios.id),
});

// Termo aditivo contratual (Lei 14.133/2021, art. 124/125). O efeito de cada
// tipo é aplicado de forma diferente:
// - VALOR/SUPRESSAO: nunca grava um valorTotal — ContratosService soma os
//   aditivos de valor ao valor derivado dos itens a cada leitura (mesmo
//   princípio de "saldo sempre derivado" do resto do projeto).
// - PRAZO: atualiza contratos.vigenciaFinal diretamente — ao contrário de
//   saldo (um running balance), a data de vigência é um fato legal que o
//   aditivo efetivamente altera, não algo recalculado a cada leitura.
// - QUANTIDADE: atualiza itensContrato.quantidade diretamente pelos mesmos
//   motivos — a linha em aditivoItens é só o registro histórico do evento.
export const aditivos = pgTable('aditivos', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  contratoId: uuid('contrato_id').notNull().references(() => contratos.id, { onDelete: 'cascade' }),
  numero: text('numero').notNull(),
  tipo: tipoAditivoEnum('tipo').notNull(),
  dataAssinatura: timestamp('data_assinatura').notNull(),
  percentual: numeric('percentual', { precision: 6, scale: 2 }),
  valorAcrescimo: numeric('valor_acrescimo', { precision: 14, scale: 2 }),
  diasProrrogacao: integer('dias_prorrogacao'),
  vigenciaFinalAnterior: timestamp('vigencia_final_anterior'),
  vigenciaFinalNova: timestamp('vigencia_final_nova'),
  fundamentoLegal: text('fundamento_legal').notNull(),
  justificativa: text('justificativa').notNull(),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

export const aditivoItens = pgTable('aditivo_itens', {
  id: uuid('id').defaultRandom().primaryKey(),
  aditivoId: uuid('aditivo_id').notNull().references(() => aditivos.id, { onDelete: 'cascade' }),
  itemContratoId: uuid('item_contrato_id').notNull().references(() => itensContrato.id),
  quantidadeAcrescida: numeric('quantidade_acrescida', { precision: 14, scale: 3 }).notNull(),
});

export const dotacoes = pgTable('dotacoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  gestaoUnidade: text('gestao_unidade').notNull(),
  fonteRecursos: text('fonte_recursos').notNull(),
  programaTrabalho: text('programa_trabalho').notNull(),
  elementoDespesa: text('elemento_despesa'),
});

export const contratoDotacoes = pgTable('contrato_dotacoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  contratoId: uuid('contrato_id').notNull().references(() => contratos.id, { onDelete: 'cascade' }),
  dotacaoId: uuid('dotacao_id').notNull().references(() => dotacoes.id),
}, (t) => ({
  uniqPar: unique().on(t.contratoId, t.dotacaoId),
}));

// Ordem só nasce de contrato — não existe ordem derivada diretamente de ata
// ou de homologação (ver MODELO.md, seção 2). contratoId é obrigatório em
// nível de aplicação (CreateOrdemDto), não NOT NULL aqui, para não quebrar
// nenhuma ordem legada que ainda exista sem essa checagem no schema.
export const ordens = pgTable('ordens', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  numero: integer('numero').notNull(),
  contratoId: uuid('contrato_id').references(() => contratos.id),
  unidadeExecutoraId: uuid('unidade_executora_id').references(() => unidadesExecutoras.id),
  status: statusOrdemEnum('status').notNull().default('EMITIDA'),
  statusAssinaturas: statusAssinaturasEnum('status_assinaturas').notNull().default('nao_iniciado'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqNumero: unique().on(t.tenantId, t.numero),
}));

export const itensOrdem = pgTable('itens_ordem', {
  id: uuid('id').defaultRandom().primaryKey(),
  ordemId: uuid('ordem_id').notNull().references(() => ordens.id, { onDelete: 'cascade' }),
  itemContratoId: uuid('item_contrato_id').references(() => itensContrato.id),
  quantidade: numeric('quantidade', { precision: 14, scale: 3 }).notNull(),
  precoUnitario: numeric('preco_unitario', { precision: 14, scale: 4 }).notNull(),
  precoTotal: numeric('preco_total', { precision: 14, scale: 2 }).notNull(),
});

// Rateio de uma ordem entre mais de uma dotação orçamentária — substitui a
// antiga FK única ordens.dotacaoId (removida: uma única fonte de verdade).
export const ordemDotacoes = pgTable('ordem_dotacoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ordemId: uuid('ordem_id').notNull().references(() => ordens.id, { onDelete: 'cascade' }),
  dotacaoId: uuid('dotacao_id').notNull().references(() => dotacoes.id),
  valorRateado: numeric('valor_rateado', { precision: 14, scale: 2 }),
});

// Log imutável, só insert — alimenta o modal "Ver histórico" do painel de ordens.
export const ordemHistorico = pgTable('ordem_historico', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ordemId: uuid('ordem_id').notNull().references(() => ordens.id, { onDelete: 'cascade' }),
  tipoEvento: tipoEventoHistoricoEnum('tipo_evento').notNull(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  dadosSnapshot: jsonb('dados_snapshot'),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

export const contadores = pgTable('contadores', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique().references(() => tenants.id),
  proximaOrdem: integer('proxima_ordem').notNull().default(1),
});

// ---------- ATAS DE REGISTRO DE PREÇOS & CREDENCIAMENTOS ----------
// Uma ata pode ser compartilhada por vários órgãos (Sistema de Registro de
// Preços — Lei 14.133/2021), cada um com seu próprio saldo — diferente de
// contrato, que é 1 secretaria : 1 saldo. Ver briefing_atas_credenciamentos.md.
export const atas = pgTable('atas', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  tipo: tipoAtaEnum('tipo').notNull().default('ATAS'),
  numeroArp: text('numero_arp').notNull(),
  licitacaoId: uuid('licitacao_id').notNull().references(() => licitacoes.id),
  detentorPrincipalId: uuid('detentor_principal_id').notNull().references(() => fornecedores.id),
  // Uma ata por fornecedor homologado, no máximo — UNIQUE permite múltiplos
  // NULL (atas que não vêm de homologação nenhuma continuam livres).
  homologacaoFornecedorId: uuid('homologacao_fornecedor_id').references(() => homologacaoFornecedores.id),
  // De qual ata esta nasceu via "Renovar Ata" (POST /atas/:id/renovar) — null
  // pra atas originais. Autorreferência, sem onDelete cascade (a ata original
  // some silenciosamente não é uma perda aceitável do vínculo do ciclo).
  ataOrigemId: uuid('ata_origem_id').references((): any => atas.id),
  vigenciaInicial: timestamp('vigencia_inicial').notNull(),
  vigenciaFinal: timestamp('vigencia_final').notNull(),
  atasComLotes: boolean('atas_com_lotes').notNull().default(false),
  formaControleSaldo: formaControleSaldoEnum('forma_controle_saldo').notNull().default('NORMAL'),
  casasDecimaisValor: integer('casas_decimais_valor').notNull().default(2),
  casasDecimaisQuantidade: integer('casas_decimais_quantidade').notNull().default(3),
  situacao: situacaoAtaEnum('situacao').notNull().default('VIGENTE'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqNumeroArp: unique().on(t.tenantId, t.numeroArp),
  uniqHomologacaoFornecedor: unique().on(t.homologacaoFornecedorId),
}));

// Só existe quando atas.atasComLotes = true — "Gerenciar lotes" cadastra
// (número + nome); ataItens.loteId aponta pra cá.
export const ataLotes = pgTable('ata_lotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ataId: uuid('ata_id').notNull().references(() => atas.id, { onDelete: 'cascade' }),
  numero: text('numero').notNull(),
  nome: text('nome').notNull(),
}, (t) => ({
  uniqNumero: unique().on(t.ataId, t.numero),
}));

export const ataOrgaos = pgTable('ata_orgaos', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ataId: uuid('ata_id').notNull().references(() => atas.id, { onDelete: 'cascade' }),
  secretariaId: uuid('secretaria_id').notNull().references(() => secretarias.id),
  perfil: perfilOrgaoAtaEnum('perfil').notNull(),
}, (t) => ({
  uniqParOrgao: unique().on(t.ataId, t.secretariaId),
}));

// Item pertence ao par ata+órgão (não à ata diretamente) — cada órgão tem seu
// próprio saldo por item, mesmo quando o item "equivalente" existe em outro
// órgão da mesma ata (é isso que o remanejamento de saldo transfere).
export const ataItens = pgTable('ata_itens', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ataOrgaoId: uuid('ata_orgao_id').notNull().references(() => ataOrgaos.id, { onDelete: 'cascade' }),
  numeroItem: integer('numero_item').notNull(),
  descricao: text('descricao').notNull(),
  unidade: text('unidade').notNull(),
  loteId: uuid('lote_id').references(() => ataLotes.id),
  quantidadeContratada: numeric('quantidade_contratada', { precision: 14, scale: 3 }).notNull(),
  valorUnitario: numeric('valor_unitario', { precision: 14, scale: 4 }).notNull(),
  // Rastreia de qual item-mestre da homologação este item de ata puxa saldo —
  // a soma de quantidadeContratada de todos os ataItens com o mesmo
  // homologacaoItemId, em qualquer órgão desta ata, nunca pode ultrapassar
  // homologacaoItens.quantidade (validado em AtasService.addItem).
  homologacaoItemId: uuid('homologacao_item_id').references(() => homologacaoItens.id),
}, (t) => ({
  uniqNumero: unique().on(t.ataOrgaoId, t.numeroItem),
}));

// Log imutável, só insert — histórico auditável do modal de remanejamento.
export const ataRemanejamentos = pgTable('ata_remanejamentos', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  ataItemOrigemId: uuid('ata_item_origem_id').notNull().references(() => ataItens.id),
  ataItemDestinoId: uuid('ata_item_destino_id').notNull().references(() => ataItens.id),
  quantidade: numeric('quantidade', { precision: 14, scale: 3 }).notNull(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  criadoEm: timestamp('criado_em').defaultNow().notNull(),
});

// ---------- CONFIGURAÇÕES DO MÓDULO DE COMPRAS ----------
// CNPJ emissor da ordem — municípios com fundos (saúde, assistência social)
// costumam ter CNPJ próprio por fundo. Ver briefing_configuracoes.md.
export const unidadesExecutoras = pgTable('unidades_executoras', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  cnpj: text('cnpj').notNull(),
  razaoSocial: text('razao_social').notNull(),
  endereco: text('endereco'),
  cep: text('cep'),
  email: text('email'),
  ordenadorNome: text('ordenador_nome'),
  ordenadorCargo: text('ordenador_cargo'),
  ordenadorPortaria: text('ordenador_portaria'),
}, (t) => ({
  uniqCnpj: unique().on(t.tenantId, t.cnpj),
}));

// Singleton por tenant (uma linha, criada sob demanda com os defaults na
// primeira leitura — ver ConfiguracoesService.getOuCriar). O sequencial de
// ordem em si continua vivendo em `contadores` (não duplicado aqui) — a tela
// de Configurações só lê/edita esse valor através do endpoint.
export const configuracoesCompras = pgTable('configuracoes_compras', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique().references(() => tenants.id),
  permitirOrdemContratoVencido: boolean('permitir_ordem_contrato_vencido').notNull().default(false),
  dotacaoObrigatoria: boolean('dotacao_obrigatoria').notNull().default(true),
});

// ---------- SETORES & MÓDULOS (catálogo de plataforma + habilitação por tenant) ----------
// Catálogo global (não por tenant) — substitui os dois arrays hoje hardcoded
// e duplicados (MENU em Layout.tsx, RECURSOS em Usuarios.tsx) por uma única
// fonte. `disponivel: false` = setor "Em breve", nem a plataforma pode ligar.
export const setores = pgTable('setores', {
  id: uuid('id').defaultRandom().primaryKey(),
  chave: text('chave').notNull().unique(),
  nome: text('nome').notNull(),
  descricao: text('descricao').notNull(),
  disponivel: boolean('disponivel').notNull().default(false),
});

// `recurso` é a mesma string já usada em permissoes.recurso — este catálogo
// não substitui a checagem de permissão por usuário, só define QUAIS módulos
// existem e a QUE setor pertencem (ver SetoresService.modulosDoTenant).
export const modulos = pgTable('modulos', {
  id: uuid('id').defaultRandom().primaryKey(),
  setorId: uuid('setor_id').notNull().references(() => setores.id, { onDelete: 'cascade' }),
  recurso: text('recurso').notNull().unique(),
  nome: text('nome').notNull(),
  icone: text('icone').notNull(),
});

// Sem linha aqui para um (tenantId, setorId) = setor não habilitado pra esse
// tenant (padrão restritivo) — ver migração, que semeia uma linha
// habilitado=true de "Setor de Compras" pra todo tenant já existente.
export const tenantSetores = pgTable('tenant_setores', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  setorId: uuid('setor_id').notNull().references(() => setores.id),
  habilitado: boolean('habilitado').notNull().default(true),
}, (t) => ({
  uniqParTenantSetor: unique().on(t.tenantId, t.setorId),
}));

// ---------- RELATIONS (para queries aninhadas do drizzle) ----------
export const usuariosRelations = relations(usuarios, ({ many }) => ({
  permissoes: many(permissoes),
}));
export const permissoesRelations = relations(permissoes, ({ one }) => ({
  usuario: one(usuarios, { fields: [permissoes.usuarioId], references: [usuarios.id] }),
}));
export const licitacoesRelations = relations(licitacoes, ({ many }) => ({
  homologacoes: many(licitacaoHomologacoes),
}));
export const licitacaoHomologacoesRelations = relations(licitacaoHomologacoes, ({ one, many }) => ({
  licitacao: one(licitacoes, { fields: [licitacaoHomologacoes.licitacaoId], references: [licitacoes.id] }),
  enviadoPorUsuario: one(usuarios, { fields: [licitacaoHomologacoes.enviadoPor], references: [usuarios.id] }),
  fornecedores: many(homologacaoFornecedores),
}));
export const homologacaoFornecedoresRelations = relations(homologacaoFornecedores, ({ one, many }) => ({
  homologacao: one(licitacaoHomologacoes, { fields: [homologacaoFornecedores.homologacaoId], references: [licitacaoHomologacoes.id] }),
  fornecedor: one(fornecedores, { fields: [homologacaoFornecedores.fornecedorId], references: [fornecedores.id] }),
  itens: many(homologacaoItens),
  ata: one(atas, { fields: [homologacaoFornecedores.id], references: [atas.homologacaoFornecedorId] }),
  contratosDiretos: many(contratos),
}));
export const homologacaoItensRelations = relations(homologacaoItens, ({ one, many }) => ({
  fornecedorHomologado: one(homologacaoFornecedores, { fields: [homologacaoItens.homologacaoFornecedorId], references: [homologacaoFornecedores.id] }),
  ataItens: many(ataItens),
  itensContrato: many(itensContrato),
}));
export const contratosRelations = relations(contratos, ({ many, one }) => ({
  itens: many(itensContrato),
  dotacoes: many(contratoDotacoes),
  ordens: many(ordens),
  aditivos: many(aditivos),
  apostilamentos: many(contratoApostilamentos),
  licitacao: one(licitacoes, { fields: [contratos.licitacaoId], references: [licitacoes.id] }),
  orgaoGerenciador: one(secretarias, { fields: [contratos.orgaoGerenciadorId], references: [secretarias.id] }),
  fornecedor: one(fornecedores, { fields: [contratos.fornecedorId], references: [fornecedores.id] }),
  ataOrgao: one(ataOrgaos, { fields: [contratos.ataOrgaoId], references: [ataOrgaos.id] }),
  homologacaoFornecedor: one(homologacaoFornecedores, { fields: [contratos.homologacaoFornecedorId], references: [homologacaoFornecedores.id] }),
}));
export const itensContratoRelations = relations(itensContrato, ({ one, many }) => ({
  contrato: one(contratos, { fields: [itensContrato.contratoId], references: [contratos.id] }),
  itensOrdem: many(itensOrdem),
  aditivoItens: many(aditivoItens),
  homologacaoItem: one(homologacaoItens, { fields: [itensContrato.homologacaoItemId], references: [homologacaoItens.id] }),
}));
export const contratoApostilamentosRelations = relations(contratoApostilamentos, ({ one }) => ({
  contrato: one(contratos, { fields: [contratoApostilamentos.contratoId], references: [contratos.id] }),
  usuario: one(usuarios, { fields: [contratoApostilamentos.criadoPor], references: [usuarios.id] }),
}));
export const aditivosRelations = relations(aditivos, ({ one, many }) => ({
  contrato: one(contratos, { fields: [aditivos.contratoId], references: [contratos.id] }),
  itens: many(aditivoItens),
}));
export const aditivoItensRelations = relations(aditivoItens, ({ one }) => ({
  aditivo: one(aditivos, { fields: [aditivoItens.aditivoId], references: [aditivos.id] }),
  itemContrato: one(itensContrato, { fields: [aditivoItens.itemContratoId], references: [itensContrato.id] }),
}));
export const ordensRelations = relations(ordens, ({ many, one }) => ({
  itens: many(itensOrdem),
  contrato: one(contratos, { fields: [ordens.contratoId], references: [contratos.id] }),
  unidadeExecutora: one(unidadesExecutoras, { fields: [ordens.unidadeExecutoraId], references: [unidadesExecutoras.id] }),
  dotacoes: many(ordemDotacoes),
  historico: many(ordemHistorico),
}));

export const unidadesExecutorasRelations = relations(unidadesExecutoras, ({ many }) => ({
  ordens: many(ordens),
}));
export const itensOrdemRelations = relations(itensOrdem, ({ one }) => ({
  ordem: one(ordens, { fields: [itensOrdem.ordemId], references: [ordens.id] }),
  itemContrato: one(itensContrato, { fields: [itensOrdem.itemContratoId], references: [itensContrato.id] }),
}));

export const contratoDotacoesRelations = relations(contratoDotacoes, ({ one }) => ({
  contrato: one(contratos, { fields: [contratoDotacoes.contratoId], references: [contratos.id] }),
  dotacao: one(dotacoes, { fields: [contratoDotacoes.dotacaoId], references: [dotacoes.id] }),
}));

export const dotacoesRelations = relations(dotacoes, ({ many }) => ({
  contratos: many(contratoDotacoes),
  ordens: many(ordemDotacoes),
}));

export const ordemDotacoesRelations = relations(ordemDotacoes, ({ one }) => ({
  ordem: one(ordens, { fields: [ordemDotacoes.ordemId], references: [ordens.id] }),
  dotacao: one(dotacoes, { fields: [ordemDotacoes.dotacaoId], references: [dotacoes.id] }),
}));

export const ordemHistoricoRelations = relations(ordemHistorico, ({ one }) => ({
  ordem: one(ordens, { fields: [ordemHistorico.ordemId], references: [ordens.id] }),
  usuario: one(usuarios, { fields: [ordemHistorico.usuarioId], references: [usuarios.id] }),
}));

export const atasRelations = relations(atas, ({ many, one }) => ({
  orgaos: many(ataOrgaos),
  lotes: many(ataLotes),
  licitacao: one(licitacoes, { fields: [atas.licitacaoId], references: [licitacoes.id] }),
  detentorPrincipal: one(fornecedores, { fields: [atas.detentorPrincipalId], references: [fornecedores.id] }),
  homologacaoFornecedor: one(homologacaoFornecedores, { fields: [atas.homologacaoFornecedorId], references: [homologacaoFornecedores.id] }),
  ataOrigem: one(atas, { fields: [atas.ataOrigemId], references: [atas.id], relationName: 'renovacao' }),
  renovacoes: many(atas, { relationName: 'renovacao' }),
}));
export const ataLotesRelations = relations(ataLotes, ({ one, many }) => ({
  ata: one(atas, { fields: [ataLotes.ataId], references: [atas.id] }),
  itens: many(ataItens),
}));
export const ataOrgaosRelations = relations(ataOrgaos, ({ many, one }) => ({
  ata: one(atas, { fields: [ataOrgaos.ataId], references: [atas.id] }),
  secretaria: one(secretarias, { fields: [ataOrgaos.secretariaId], references: [secretarias.id] }),
  itens: many(ataItens),
  contratos: many(contratos),
}));
export const ataItensRelations = relations(ataItens, ({ many, one }) => ({
  ataOrgao: one(ataOrgaos, { fields: [ataItens.ataOrgaoId], references: [ataOrgaos.id] }),
  itensOrdem: many(itensOrdem),
  remanejamentosOrigem: many(ataRemanejamentos, { relationName: 'remanejamentoOrigem' }),
  remanejamentosDestino: many(ataRemanejamentos, { relationName: 'remanejamentoDestino' }),
  homologacaoItem: one(homologacaoItens, { fields: [ataItens.homologacaoItemId], references: [homologacaoItens.id] }),
  lote: one(ataLotes, { fields: [ataItens.loteId], references: [ataLotes.id] }),
}));
export const ataRemanejamentosRelations = relations(ataRemanejamentos, ({ one }) => ({
  itemOrigem: one(ataItens, { fields: [ataRemanejamentos.ataItemOrigemId], references: [ataItens.id], relationName: 'remanejamentoOrigem' }),
  itemDestino: one(ataItens, { fields: [ataRemanejamentos.ataItemDestinoId], references: [ataItens.id], relationName: 'remanejamentoDestino' }),
  usuario: one(usuarios, { fields: [ataRemanejamentos.usuarioId], references: [usuarios.id] }),
}));

export const setoresRelations = relations(setores, ({ many }) => ({
  modulos: many(modulos),
  tenantSetores: many(tenantSetores),
}));
export const modulosRelations = relations(modulos, ({ one }) => ({
  setor: one(setores, { fields: [modulos.setorId], references: [setores.id] }),
}));
export const tenantSetoresRelations = relations(tenantSetores, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantSetores.tenantId], references: [tenants.id] }),
  setor: one(setores, { fields: [tenantSetores.setorId], references: [setores.id] }),
}));

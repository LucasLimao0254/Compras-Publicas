import {
  pgTable, text, integer, boolean, timestamp, numeric, pgEnum, unique, uuid,
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
export const statusOrdemEnum = pgEnum('status_ordem', ['EMITIDA', 'CANCELADA']);

// ---------- TABELAS ----------
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  codigo: integer('codigo').notNull().unique(),
  nome: text('nome').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
}, (t) => ({
  uniqNumero: unique().on(t.contratoId, t.numero),
}));

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

export const ordens = pgTable('ordens', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  numero: integer('numero').notNull(),
  contratoId: uuid('contrato_id').notNull().references(() => contratos.id),
  dotacaoId: uuid('dotacao_id').references(() => dotacoes.id),
  status: statusOrdemEnum('status').notNull().default('EMITIDA'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uniqNumero: unique().on(t.tenantId, t.numero),
}));

export const itensOrdem = pgTable('itens_ordem', {
  id: uuid('id').defaultRandom().primaryKey(),
  ordemId: uuid('ordem_id').notNull().references(() => ordens.id, { onDelete: 'cascade' }),
  itemContratoId: uuid('item_contrato_id').notNull().references(() => itensContrato.id),
  quantidade: numeric('quantidade', { precision: 14, scale: 3 }).notNull(),
  precoUnitario: numeric('preco_unitario', { precision: 14, scale: 4 }).notNull(),
  precoTotal: numeric('preco_total', { precision: 14, scale: 2 }).notNull(),
});

export const contadores = pgTable('contadores', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().unique().references(() => tenants.id),
  proximaOrdem: integer('proxima_ordem').notNull().default(1),
});

// ---------- RELATIONS (para queries aninhadas do drizzle) ----------
export const usuariosRelations = relations(usuarios, ({ many }) => ({
  permissoes: many(permissoes),
}));
export const permissoesRelations = relations(permissoes, ({ one }) => ({
  usuario: one(usuarios, { fields: [permissoes.usuarioId], references: [usuarios.id] }),
}));
export const contratosRelations = relations(contratos, ({ many, one }) => ({
  itens: many(itensContrato),
  dotacoes: many(contratoDotacoes),
  ordens: many(ordens),
  licitacao: one(licitacoes, { fields: [contratos.licitacaoId], references: [licitacoes.id] }),
  orgaoGerenciador: one(secretarias, { fields: [contratos.orgaoGerenciadorId], references: [secretarias.id] }),
  fornecedor: one(fornecedores, { fields: [contratos.fornecedorId], references: [fornecedores.id] }),
}));
export const itensContratoRelations = relations(itensContrato, ({ one, many }) => ({
  contrato: one(contratos, { fields: [itensContrato.contratoId], references: [contratos.id] }),
  itensOrdem: many(itensOrdem),
}));
export const ordensRelations = relations(ordens, ({ many, one }) => ({
  itens: many(itensOrdem),
  contrato: one(contratos, { fields: [ordens.contratoId], references: [contratos.id] }),
  dotacao: one(dotacoes, { fields: [ordens.dotacaoId], references: [dotacoes.id] }),
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
  ordens: many(ordens),
}));

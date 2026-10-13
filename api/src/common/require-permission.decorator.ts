import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

// Marca uma rota como exigindo acesso a um recurso específico do menu,
// ex.: @RequirePermission('compras.contratos'). Usuários ADMIN sempre passam.
// Uma lista significa "qualquer um destes" — usado na LEITURA de cadastros de
// apoio (órgãos, dotações, unidades executoras…) que outras telas precisam
// para preencher seletores; a escrita continua exigindo a permissão da tela
// dona do cadastro.
export const RequirePermission = (recurso: string | string[]) => SetMetadata(PERMISSION_KEY, recurso);

// Telas de Compras que usam os cadastros de apoio em seletores/filtros.
export const TELAS_QUE_LEEM_CADASTROS_DE_APOIO = ['compras.contratos', 'compras.atas', 'compras.ordens', 'compras.licitacoes'];

import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

// Marca uma rota como exigindo acesso a um recurso específico do menu,
// ex.: @RequirePermission('compras.contratos'). Usuários ADMIN sempre passam.
export const RequirePermission = (recurso: string) => SetMetadata(PERMISSION_KEY, recurso);

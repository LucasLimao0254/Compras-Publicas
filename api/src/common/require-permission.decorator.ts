import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

// Marca uma rota como exigindo acesso a um recurso específico do menu,
// ex.: @RequirePermission('compras.contratos'). Usuários ADMIN sempre passam.
// Com mais de um recurso, basta o usuário ter QUALQUER um deles — usado nos
// endpoints de leitura que alimentam selects de outras telas (a lista de
// secretarias no formulário de contrato, a de contratos no assistente de
// ordem etc.); sem isso, um usuário com acesso só à tela que consome a lista
// recebia 403 e a tela inteira deixava de carregar.
export const RequirePermission = (...recursos: string[]) => SetMetadata(PERMISSION_KEY, recursos);

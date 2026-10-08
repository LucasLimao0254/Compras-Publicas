import { BadRequestException, Controller, Get, Param, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { MinutasService } from './minutas.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('minutas')
export class MinutasController {
  constructor(private service: MinutasService) {}

  // Cadastro/consulta de modelos vive em Configurações — mesma permissão da
  // tela (MODELO.md, seção 8).
  @RequirePermission('compras.configuracoes')
  @Get('marcadores')
  marcadores() {
    return this.service.marcadoresPorTipo();
  }

  // Também lido pelas telas de contrato e ata, para saber se o botão de
  // gerar fica habilitado — sem isso, quem não tem acesso a Configurações via
  // "nenhum modelo cadastrado" mesmo com o modelo carregado.
  @RequirePermission('compras.configuracoes', 'compras.contratos', 'compras.atas')
  @Get('modelos')
  listarModelos(@CurrentUser() u: AuthUser) {
    return this.service.listarModelos(u.tenantId);
  }

  @RequirePermission('compras.configuracoes')
  @Post('modelos/:tipo')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async enviarModelo(@CurrentUser() u: AuthUser, @Param('tipo') tipo: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    await this.service.enviarModelo(u.tenantId, u.userId, u.tipoUsuario, tipo, { originalname: file.originalname, buffer: file.buffer });
    return this.service.listarModelos(u.tenantId);
  }

  // Os quatro tipos são gerados a partir das telas de contrato e de ata —
  // basta ter acesso a uma delas. Passar pelo guard (em vez de ficar sem
  // permissão nenhuma) também faz valer a trava de setor habilitado para o
  // tenant. O isolamento por tenant continua garantido dentro do service.
  @RequirePermission('compras.contratos', 'compras.atas')
  @Get(':tipo/:entidadeId')
  async gerar(@CurrentUser() u: AuthUser, @Param('tipo') tipo: string, @Param('entidadeId') entidadeId: string) {
    const buffer = await this.service.gerar(u.tenantId, tipo, entidadeId);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: `attachment; filename="minuta-${tipo.toLowerCase()}.docx"`,
    });
  }
}

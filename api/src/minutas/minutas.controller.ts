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

  @RequirePermission('compras.configuracoes')
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

  // Sem @RequirePermission adicional de propósito: quem chega aqui já
  // passou pela tela de detalhe do contrato/ata (compras.contratos ou
  // compras.atas) de onde o botão "gerar" vive — os quatro tipos são
  // gerados a partir de páginas com permissões diferentes, e o dado exposto
  // aqui é o mesmo que a tela de origem já mostrou. O isolamento que
  // importa (tenant) continua garantido dentro do service.
  @Get(':tipo/:entidadeId')
  async gerar(@CurrentUser() u: AuthUser, @Param('tipo') tipo: string, @Param('entidadeId') entidadeId: string) {
    const buffer = await this.service.gerar(u.tenantId, tipo, entidadeId);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: `attachment; filename="minuta-${tipo.toLowerCase()}.docx"`,
    });
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AtasService } from './atas.service';
import { CreateAtaDto, ItemAtaInput, LoteAtaInput, OrgaoAtaInput, RemanejarSaldoDto, UpdateAtaDto } from './dto/ata.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.atas')
@Controller('atas')
export class AtasController {
  constructor(private service: AtasService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('aba') aba?: string) {
    return this.service.list(u.tenantId, aba === 'anteriores');
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.get(u.tenantId, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateAtaDto) { return this.service.create(u.tenantId, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAtaDto) { return this.service.update(u.tenantId, id, dto); }

  @Post(':id/orgaos')
  addOrgao(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: OrgaoAtaInput) {
    return this.service.addOrgao(u.tenantId, id, dto);
  }

  @Get(':id/orgaos/:ataOrgaoId/itens')
  itensDoOrgao(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('ataOrgaoId') ataOrgaoId: string) {
    return this.service.itensDoOrgao(u.tenantId, id, ataOrgaoId);
  }

  @Post(':id/orgaos/:ataOrgaoId/itens')
  addItem(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('ataOrgaoId') ataOrgaoId: string, @Body() dto: ItemAtaInput) {
    return this.service.addItem(u.tenantId, id, ataOrgaoId, dto);
  }

  @Patch(':id/orgaos/:ataOrgaoId/itens/:itemId')
  editarItem(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('ataOrgaoId') ataOrgaoId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ItemAtaInput,
  ) {
    return this.service.editarItem(u.tenantId, id, ataOrgaoId, itemId, dto);
  }

  @Get(':id/orgaos/:ataOrgaoId/itens/:itemId/historico')
  historicoItem(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('ataOrgaoId') ataOrgaoId: string, @Param('itemId') itemId: string) {
    return this.service.historicoItem(u.tenantId, id, ataOrgaoId, itemId);
  }

  @Post(':id/orgaos/:ataOrgaoId/itens/importar')
  @UseInterceptors(FileInterceptor('arquivo', {
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const nome = file.originalname.toLowerCase();
      if (!nome.endsWith('.xlsx') && !nome.endsWith('.xls') && !nome.endsWith('.csv')) {
        return cb(new BadRequestException('Envie um arquivo .xlsx, .xls ou .csv'), false);
      }
      cb(null, true);
    },
  }))
  importarItens(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('ataOrgaoId') ataOrgaoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.service.importarItens(u.tenantId, id, ataOrgaoId, file.buffer);
  }

  @Post(':id/lotes')
  criarLote(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: LoteAtaInput) {
    return this.service.criarLote(u.tenantId, id, dto);
  }

  @Get(':id/lotes')
  listarLotes(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.listarLotes(u.tenantId, id);
  }

  @Delete(':id/lotes/:loteId')
  removerLote(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('loteId') loteId: string) {
    return this.service.removerLote(u.tenantId, id, loteId);
  }

  @Post(':id/renovar')
  renovar(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.renovar(u.tenantId, id);
  }

  @Get(':id/contratos')
  contratosDaAta(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.contratosDaAta(u.tenantId, id);
  }

  @Post(':id/remanejar-saldo')
  remanejarSaldo(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: RemanejarSaldoDto) {
    return this.service.remanejarSaldo(u.tenantId, id, u.userId, dto);
  }

  @Get(':id/remanejamentos')
  remanejamentos(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.remanejamentos(u.tenantId, id);
  }
}

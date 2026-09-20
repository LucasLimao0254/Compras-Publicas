import {
  BadRequestException,
  Body,
  Controller,
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
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { LicitacoesHomologacaoService } from './licitacoes-homologacao.service';
import { PatchFornecedorDto, PatchItemDto } from './dto/homologacao.dto';

const UPLOADS_DIR = process.env.HOMOLOGACAO_UPLOADS_DIR || join(process.cwd(), 'uploads', 'homologacoes');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.licitacoes')
@Controller('licitacoes')
export class LicitacoesHomologacaoController {
  constructor(private service: LicitacoesHomologacaoService) {}

  @Post(':id/homologacao')
  @UseInterceptors(
    FileInterceptor('arquivo', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        // Nome gerado, nunca o original, no disco — elimina qualquer risco de
        // path traversal ou colisão; o nome original só é guardado na coluna
        // arquivoNome, para exibição.
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 15 * 1024 * 1024 },
      // Checa a extensão, não o mimetype: navegadores/SOs relatam xlsx com
      // mimetypes inconsistentes (às vezes application/octet-stream). O
      // ExtracaoHomologacaoService ainda valida o conteúdo de verdade ao
      // tentar abrir como planilha — isto aqui é só uma rejeição rápida.
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.xlsx')) return cb(new BadRequestException('Envie um arquivo .xlsx'), false);
        cb(null, true);
      },
    }),
  )
  upload(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.service.upload(u.tenantId, id, u.userId, file);
  }

  @Get(':id/homologacoes')
  listar(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.listar(u.tenantId, id);
  }

  @Get(':id/homologacao-itens')
  itensParaImportar(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('fornecedorId') fornecedorId: string) {
    return this.service.itensParaImportar(u.tenantId, id, fornecedorId);
  }

  @Get(':id/homologacao-fornecedores')
  fornecedoresHomologados(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.service.fornecedoresHomologados(u.tenantId, id);
  }

  @Get('homologacoes/:homologacaoId')
  detalhe(@CurrentUser() u: AuthUser, @Param('homologacaoId') homologacaoId: string) {
    return this.service.detalhe(u.tenantId, homologacaoId);
  }

  @Patch('homologacoes/:homologacaoId/fornecedores/:fId')
  patchFornecedor(
    @CurrentUser() u: AuthUser,
    @Param('homologacaoId') homologacaoId: string,
    @Param('fId') fId: string,
    @Body() dto: PatchFornecedorDto,
  ) {
    return this.service.patchFornecedor(u.tenantId, homologacaoId, fId, dto);
  }

  @Patch('homologacoes/:homologacaoId/itens/:itemId')
  patchItem(
    @CurrentUser() u: AuthUser,
    @Param('homologacaoId') homologacaoId: string,
    @Param('itemId') itemId: string,
    @Body() dto: PatchItemDto,
  ) {
    return this.service.patchItem(u.tenantId, homologacaoId, itemId, dto);
  }

  @Post('homologacoes/:homologacaoId/concluir-revisao')
  concluirRevisao(@CurrentUser() u: AuthUser, @Param('homologacaoId') homologacaoId: string) {
    return this.service.concluirRevisao(u.tenantId, homologacaoId);
  }
}

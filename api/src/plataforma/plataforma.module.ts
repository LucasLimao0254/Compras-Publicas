import { Module } from '@nestjs/common';
import { PlataformaService } from './plataforma.service';
import { PlataformaController } from './plataforma.controller';

@Module({ providers: [PlataformaService], controllers: [PlataformaController] })
export class PlataformaModule {}

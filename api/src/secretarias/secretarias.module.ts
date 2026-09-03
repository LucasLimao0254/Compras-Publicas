import { Module } from '@nestjs/common';
import { SecretariasService } from './secretarias.service';
import { SecretariasController } from './secretarias.controller';

@Module({ providers: [SecretariasService], controllers: [SecretariasController], exports: [SecretariasService] })
export class SecretariasModule {}

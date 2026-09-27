import { Module } from '@nestjs/common';
import { MinutasService } from './minutas.service';
import { MinutasController } from './minutas.controller';

@Module({
  providers: [MinutasService],
  controllers: [MinutasController],
})
export class MinutasModule {}

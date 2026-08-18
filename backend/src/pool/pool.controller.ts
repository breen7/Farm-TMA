import { Controller, Get, UseGuards } from '@nestjs/common';
import { PoolService } from './pool.service';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('admin/pool-health')
@UseGuards(AdminGuard)
export class PoolController {
  constructor(private readonly poolService: PoolService) {}

  @Get()
  async getHealth() {
    return this.poolService.getHealthSnapshot();
  }
}

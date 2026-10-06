import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '../observability/metrics.service';

@Controller()
export class SystemController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  metrics() {
    return this.metricsService.renderText();
  }
}

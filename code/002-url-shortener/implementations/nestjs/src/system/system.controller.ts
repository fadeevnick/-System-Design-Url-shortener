import {
  Controller,
  Get,
  Header,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
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

  @Post('metrics/reset')
  resetMetrics(@Headers('x-metrics-reset-token') token?: string) {
    const expectedToken = process.env.METRICS_RESET_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException();
    }

    this.metricsService.reset();
    return { status: 'ok' };
  }
}

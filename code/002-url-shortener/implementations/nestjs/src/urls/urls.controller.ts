import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from '../observability/metrics.service';
import { CreateShortUrlDto } from './create-short-url.dto';
import { UrlsService } from './urls.service';

@Controller()
export class UrlsController {
  constructor(
    private readonly urlsService: UrlsService,
    private readonly metricsService: MetricsService,
  ) {}

  @Post('shorten')
  async create(@Body() body: CreateShortUrlDto) {
    const startedAt = Date.now();
    let status = 201;

    try {
      return await this.urlsService.create(body.longUrl);
    } catch (error) {
      status = this.statusFromError(error);
      throw error;
    } finally {
      this.metricsService.increment('http_requests_total', {
        method: 'POST',
        route: '/shorten',
        status,
      });
      this.metricsService.observeMs('http_request_duration', Date.now() - startedAt, {
        method: 'POST',
        route: '/shorten',
        status,
      });
    }
  }

  @Get(':shortCode')
  async redirect(@Param('shortCode') shortCode: string, @Res() response: Response) {
    const startedAt = Date.now();
    let status = 302;

    try {
      const longUrl = await this.urlsService.resolve(shortCode);

      if (!longUrl) {
        status = 404;
        this.metricsService.increment('redirect_404_total');
        throw new NotFoundException('Short URL was not found');
      }

      return response.redirect(302, longUrl);
    } catch (error) {
      status = this.statusFromError(error);
      throw error;
    } finally {
      this.metricsService.increment('http_requests_total', {
        method: 'GET',
        route: '/:shortCode',
        status,
      });
      this.metricsService.observeMs('http_request_duration', Date.now() - startedAt, {
        method: 'GET',
        route: '/:shortCode',
        status,
      });
    }
  }

  private statusFromError(error: unknown): number {
    if (typeof error === 'object' && error !== null && 'getStatus' in error) {
      const getStatus = (error as { getStatus: () => number }).getStatus;
      return getStatus();
    }

    return 500;
  }
}

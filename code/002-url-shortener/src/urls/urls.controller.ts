import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CreateShortUrlDto } from './create-short-url.dto';
import { UrlsService } from './urls.service';

@Controller()
export class UrlsController {
  constructor(private readonly urlsService: UrlsService) {}

  @Post('shorten')
  async create(@Body() body: CreateShortUrlDto) {
    return this.urlsService.create(body.longUrl);
  }

  @Get(':shortCode')
  async redirect(@Param('shortCode') shortCode: string, @Res() response: Response) {
    const longUrl = await this.urlsService.resolve(shortCode);

    if (!longUrl) {
      throw new NotFoundException('Short URL was not found');
    }

    return response.redirect(302, longUrl);
  }
}

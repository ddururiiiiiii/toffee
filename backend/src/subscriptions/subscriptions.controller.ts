import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me/subscriptions')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.listMine(user.id);
  }

  @Post('actors/:actorId/subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.subscriptionsService.subscribe(user.id, actorId);
  }

  @Delete('actors/:actorId/subscribe')
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.subscriptionsService.unsubscribe(user.id, actorId);
  }
}

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MessagesService } from './messages.service.js';
import { SendReplyDto } from './dto/send-reply.dto.js';
import { SendBroadcastDto } from './dto/send-broadcast.dto.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';

@Controller('actors/:actorId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  listForFan(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.messagesService.listForFan(user.id, actorId);
  }

  @Post('reply')
  sendReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actorId') actorId: string,
    @Body() dto: SendReplyDto,
  ) {
    return this.messagesService.sendReply(user.id, actorId, dto);
  }

  @Roles(Role.AGENCY_STAFF, Role.ADMIN)
  @Post('broadcast')
  sendBroadcast(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actorId') actorId: string,
    @Body() dto: SendBroadcastDto,
  ) {
    return this.messagesService.sendBroadcast(user.id, actorId, dto);
  }

  // 'replies'가 아무 :id 라우트보다 먼저 매칭될 필요는 없음 — 형제 라우트가 reply/broadcast뿐이라 충돌 없음
  @Roles(Role.AGENCY_STAFF, Role.ADMIN)
  @Get('replies')
  listReplies(@CurrentUser() user: AuthenticatedUser, @Param('actorId') actorId: string) {
    return this.messagesService.listReplies(user.id, actorId);
  }
}

import { IsBoolean } from 'class-validator';

export class SetNotificationsDto {
  @IsBoolean()
  muted!: boolean;
}

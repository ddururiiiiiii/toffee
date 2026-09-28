import { IsIn } from 'class-validator';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../common/i18n/locales.js';

export class UpdateLocaleDto {
  @IsIn(SUPPORTED_LOCALES)
  locale!: SupportedLocale;
}

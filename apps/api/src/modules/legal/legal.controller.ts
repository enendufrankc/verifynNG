import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/tenant';
import {
  LEGAL_DOC_KINDS,
  LegalDocKind,
  LegalDocumentService,
} from './legal-document.service';

function assertKind(kind: string): LegalDocKind {
  if (!LEGAL_DOC_KINDS.includes(kind as LegalDocKind)) {
    throw new NotFoundException('legal_document_not_found');
  }
  return kind as LegalDocKind;
}

@Controller('v1/legal')
export class LegalController {
  constructor(private readonly legal: LegalDocumentService) {}

  @Public()
  @Get('subprocessors')
  subprocessors(@Query('locale') locale?: string) {
    return this.legal.current('subprocessors', locale);
  }

  @Public()
  @Get(':kind/versions')
  versions(@Param('kind') kind: string, @Query('locale') locale?: string) {
    return this.legal.list(assertKind(kind), locale);
  }

  @Public()
  @Get(':kind')
  current(@Param('kind') kind: string, @Query('locale') locale?: string) {
    return this.legal.current(assertKind(kind), locale);
  }
}

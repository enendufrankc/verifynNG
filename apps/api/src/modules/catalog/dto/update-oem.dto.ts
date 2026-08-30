import { PartialType } from '@nestjs/mapped-types';
import { CreateOemDto } from './create-oem.dto';

export class UpdateOemDto extends PartialType(CreateOemDto) {}

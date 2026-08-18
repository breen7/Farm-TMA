import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string, metadata: ArgumentMetadata): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`${metadata.data ?? 'value'} must be a valid integer`);
    }
  }
}

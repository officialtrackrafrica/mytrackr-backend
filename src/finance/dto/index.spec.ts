import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AssetQueryDto, TransactionQueryDto } from './index';

describe('Finance DTO boolean query parsing', () => {
  it('parses isCategorised=false as boolean false', () => {
    const dto = plainToInstance(TransactionQueryDto, {
      isCategorised: 'false',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.isCategorised).toBe(false);
  });

  it('parses isCategorised=true as boolean true', () => {
    const dto = plainToInstance(TransactionQueryDto, {
      isCategorised: 'true',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.isCategorised).toBe(true);
  });

  it('parses includeArchived=false as boolean false', () => {
    const dto = plainToInstance(AssetQueryDto, {
      includeArchived: 'false',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.includeArchived).toBe(false);
  });
});

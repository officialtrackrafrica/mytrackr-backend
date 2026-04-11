import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../../admin/entities/system-setting.entity';

@Injectable()
export class SystemSettingsSeed {
  private readonly logger = new Logger(SystemSettingsSeed.name);

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepository: Repository<SystemSetting>,
  ) {}

  async run() {
    const defaults = [
      {
        key: 'billing.additional_bank_account_fee',
        value: { amount: 1000, currency: 'NGN' },
        category: 'billing',
        description: 'Default fee charged for each additional linked bank account after the first free account',
      },
    ];

    for (const settingData of defaults) {
      const existing = await this.settingsRepository.findOne({
        where: { key: settingData.key },
      });

      if (existing) {
        this.logger.debug(`System setting ${settingData.key} already exists, updating...`);
        Object.assign(existing, settingData);
        await this.settingsRepository.save(existing);
      } else {
        this.logger.log(`Creating system setting ${settingData.key}...`);
        const setting = this.settingsRepository.create(settingData);
        await this.settingsRepository.save(setting);
      }
    }
  }
}

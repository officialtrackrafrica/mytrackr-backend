import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly saltLength = 16;
  private readonly password: string;

  constructor() {
    this.password = process.env.ENCRYPTION_PASSWORD || 'default_dev_password';
  }

  private deriveKey(salt: Buffer): Buffer {
    return crypto.scryptSync(this.password, salt, this.keyLength);
  }

  encrypt(text: string): {
    encrypted: string;
    iv: string;
    tag: string;
    salt: string;
  } {
    const salt = crypto.randomBytes(this.saltLength);
    const key = this.deriveKey(salt);
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      salt: salt.toString('hex'),
    };
  }

  decrypt(encryptedData: {
    encrypted: string;
    iv: string;
    tag: string;
    salt?: string;
  }): string {
    const salt = encryptedData.salt
      ? Buffer.from(encryptedData.salt, 'hex')
      : Buffer.from('salt');
    const key = this.deriveKey(salt);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { MfaService } from '../services/mfa.service';
import {
  EnableMfaResponseDto,
  VerifyMfaSetupDto,
  MfaEnabledResponseDto,
  DisableMfaDto,
  DisableMfaResponseDto,
  RegenerateBackupCodesDto,
  BackupCodesResponseDto,
} from '../dto/mfa.dto';
import { AuthError } from '../../common/errors';

@ApiTags('MFA (Two-Factor Authentication)')
@Controller('auth/mfa')
@ApiCookieAuth('accessToken')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('enable')
  @ApiOperation({
    summary: 'Generate TOTP secret and QR code for Google Authenticator',
  })
  @ApiResponse({
    status: 201,
    description: 'Secret and QR code generated',
    type: EnableMfaResponseDto,
  })
  @ApiResponse({ status: 400, description: 'MFA already enabled' })
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Create, 'Mfa'))
  async enableMfa(@Req() req: any): Promise<EnableMfaResponseDto> {
    try {
      return await this.mfaService.generateSecret(req.user.id);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'MFA_ENABLE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('verify-setup')
  @ApiOperation({
    summary: 'Verify TOTP code to complete MFA setup',
  })
  @ApiBody({ type: VerifyMfaSetupDto })
  @ApiResponse({
    status: 201,
    description: 'MFA enabled, backup codes returned',
    type: MfaEnabledResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid code or MFA not initiated',
  })
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Update, 'Mfa'))
  async verifySetup(
    @Req() req: any,
    @Body() dto: VerifyMfaSetupDto,
  ): Promise<MfaEnabledResponseDto> {
    try {
      return await this.mfaService.verifyAndEnable(req.user.id, dto.token);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'MFA_VERIFY_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('disable')
  @ApiOperation({
    summary: 'Disable MFA (requires TOTP code + password)',
  })
  @ApiBody({ type: DisableMfaDto })
  @ApiResponse({
    status: 201,
    description: 'MFA disabled',
    type: DisableMfaResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid code or MFA not enabled' })
  @ApiResponse({ status: 401, description: 'Invalid password' })
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Delete, 'Mfa'))
  async disableMfa(
    @Req() req: any,
    @Body() dto: DisableMfaDto,
  ): Promise<DisableMfaResponseDto> {
    try {
      return await this.mfaService.disable(
        req.user.id,
        dto.token,
        dto.password,
      );
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'MFA_DISABLE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('backup-codes')
  @ApiOperation({
    summary: 'Regenerate backup codes (requires TOTP code)',
  })
  @ApiBody({ type: RegenerateBackupCodesDto })
  @ApiResponse({
    status: 201,
    description: 'New backup codes generated',
    type: BackupCodesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid code or MFA not enabled' })
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Update, 'Mfa'))
  async regenerateBackupCodes(
    @Req() req: any,
    @Body() dto: RegenerateBackupCodesDto,
  ): Promise<BackupCodesResponseDto> {
    try {
      return await this.mfaService.regenerateBackupCodes(
        req.user.id,
        dto.token,
      );
    } catch (error) {
      if (error instanceof AuthError) {
        throw new HttpException(
          { error: error.code, message: error.message },
          error.status,
        );
      }
      throw new HttpException(
        {
          error: 'BACKUP_CODES_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

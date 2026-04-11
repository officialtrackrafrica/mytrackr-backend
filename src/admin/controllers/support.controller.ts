import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { AdminSystemService } from '../services/admin-system.service';
import {
  CreateSupportTicketDto,
  CreateSupportTicketUploadDto,
  SupportTicketResponseDto,
  UserSupportTicketQueryDto,
} from '../dto';

@ApiTags('Support')
@ApiCookieAuth('accessToken')
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly systemService: AdminSystemService) {}

  @Post('tickets')
  @UseInterceptors(FileInterceptor('attachment'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateSupportTicketUploadDto })
  @ApiOperation({ summary: 'Create a support ticket' })
  @ApiResponse({
    status: 201,
    description: 'Support ticket created',
    type: SupportTicketResponseDto,
  })
  async createTicket(
    @Req() req: any,
    @Body() dto: CreateSupportTicketDto,
    @UploadedFile() attachment?: any,
  ) {
    return this.systemService.createUserSupportTicket(
      req.user.id,
      dto,
      attachment,
    );
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List support tickets for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Paginated user support tickets',
  })
  async getMyTickets(@Req() req: any, @Query() query: UserSupportTicketQueryDto) {
    return this.systemService.getUserSupportTickets(req.user.id, query);
  }
}

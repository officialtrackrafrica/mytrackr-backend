import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import {
  BusinessService,
  CreateBusinessDto,
  UpdateBusinessDto,
} from './services/business.service';

@ApiTags('Business')
@Controller('businesses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new business' })
  @ApiResponse({ status: 201, description: 'Business created' })
  create(@Req() req: any, @Body() dto: CreateBusinessDto) {
    return this.businessService.create(req.user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all businesses for the user' })
  findAll(@Req() req: any) {
    return this.businessService.findAllForUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific business' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.businessService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a business' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businessService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a business' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.businessService.remove(id, req.user.id);
  }
}

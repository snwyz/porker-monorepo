import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from "@nestjs/common";

import { CreateJobSchema, JobIdSchema } from "./job.schema.js";
import { JobsService } from "./jobs.service.js";
import { TranslationsService } from "../translations/translations.service.js";

@Controller("v1/jobs")
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly translations: TranslationsService,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    const input = CreateJobSchema.safeParse(body);
    if (!input.success) {
      throw new BadRequestException({
        issues: input.error.issues,
        message: "Invalid translation job payload",
      });
    }
    await this.translations.validateSelectedCodes(input.data.codes);
    return this.jobs.create(input.data);
  }

  @Get()
  list() {
    return this.jobs.list();
  }

  @Get(":id")
  find(@Param("id") id: string) {
    const parsedId = JobIdSchema.safeParse(id);
    if (!parsedId.success) {
      throw new BadRequestException("Invalid translation job id");
    }
    return this.jobs.find(parsedId.data);
  }
}

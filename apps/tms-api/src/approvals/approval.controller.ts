import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import { JobIdSchema } from "../jobs/job.schema.js";
import { JobsService } from "../jobs/jobs.service.js";
import { TranslationsService } from "../translations/translations.service.js";
import { EditProposalSchema } from "./approval.schema.js";
import { ApprovalService } from "./approval.service.js";

@Controller("v1/jobs")
export class ApprovalController {
  constructor(
    private readonly jobs: JobsService,
    private readonly translations: TranslationsService,
    private readonly approvals: ApprovalService,
  ) {}

  @Post(":id/run")
  @HttpCode(202)
  async run(@Param("id") id: string) {
    const job = await this.jobs.find(parseId(id));
    return this.jobs.update(await this.translations.run(job));
  }

  @Patch(":id/proposals/:code")
  async edit(
    @Param("id") id: string,
    @Param("code") code: string,
    @Body() body: unknown,
  ) {
    const input = EditProposalSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException("Invalid proposal payload");
    const job = await this.jobs.find(parseId(id));
    return this.jobs.update(this.approvals.edit(job, code, input.data));
  }

  @Post(":id/approve")
  @HttpCode(200)
  async approve(@Param("id") id: string) {
    const job = await this.jobs.find(parseId(id));
    try {
      return await this.jobs.update(await this.approvals.approve(job));
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      await this.jobs.update({ ...job, status: "PUBLISH_FAILED" });
      throw error;
    }
  }
}

function parseId(id: string): string {
  const parsed = JobIdSchema.safeParse(id);
  if (!parsed.success)
    throw new BadRequestException("Invalid translation job id");
  return parsed.data;
}

import { type DynamicModule, Module } from "@nestjs/common";

import { JobRepository } from "./jobs/job.repository.js";
import { JobsController } from "./jobs/jobs.controller.js";
import { JobsService } from "./jobs/jobs.service.js";
import { ApprovalController } from "./approvals/approval.controller.js";
import { ApprovalService } from "./approvals/approval.service.js";
import { rename } from "node:fs/promises";
import {
  TranslationsService,
  type I18nFiles,
  type TranslationExecutor,
} from "./translations/translations.service.js";
import { createAgentTranslationExecutor } from "./translations/agents.executor.js";
import type { ReplaceLocaleFile } from "./approvals/approval.service.js";

export type TmsApiOptions = {
  readonly i18nFiles: I18nFiles;
  readonly replaceLocaleFile?: ReplaceLocaleFile;
  readonly translationExecutor?: TranslationExecutor;
};

@Module({})
export class AppModule {
  static forRoot(dataDirectory: string, options: TmsApiOptions): DynamicModule {
    return {
      controllers: [JobsController, ApprovalController],
      module: AppModule,
      providers: [
        JobsService,
        ApprovalService,
        TranslationsService,
        { provide: "TMS_I18N_FILES", useValue: options.i18nFiles },
        {
          provide: "TMS_REPLACE_LOCALE_FILE",
          useValue: options.replaceLocaleFile ?? rename,
        },
        {
          provide: "TMS_TRANSLATION_EXECUTOR",
          useValue:
            options.translationExecutor ?? createAgentTranslationExecutor(),
        },
        {
          provide: JobRepository,
          useFactory: () => new JobRepository(dataDirectory),
        },
      ],
    };
  }
}

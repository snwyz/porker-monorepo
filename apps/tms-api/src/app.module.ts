import { type DynamicModule, Module } from "@nestjs/common";

import { JobRepository } from "./jobs/job.repository.js";
import { JobsController } from "./jobs/jobs.controller.js";
import { JobsService } from "./jobs/jobs.service.js";
import { ApprovalController } from "./approvals/approval.controller.js";
import {
  ApprovalService,
  atomicPublisher,
  type Publisher,
} from "./approvals/approval.service.js";
import {
  TranslationsService,
  type I18nFiles,
  type TranslationExecutor,
} from "./translations/translations.service.js";

export type TmsApiOptions = {
  readonly i18nFiles: I18nFiles;
  readonly publisher?: Publisher;
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
          provide: "TMS_PUBLISHER",
          useValue: options.publisher ?? atomicPublisher,
        },
        {
          provide: "TMS_TRANSLATION_EXECUTOR",
          useValue: options.translationExecutor ?? {
            async translate(): Promise<never> {
              throw new Error("No translation executor configured");
            },
          },
        },
        {
          provide: JobRepository,
          useFactory: () => new JobRepository(dataDirectory),
        },
      ],
    };
  }
}

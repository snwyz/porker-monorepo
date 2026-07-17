import { type DynamicModule, Module } from "@nestjs/common";

import { JobRepository } from "./jobs/job.repository.js";
import { JobsController } from "./jobs/jobs.controller.js";
import { JobsService } from "./jobs/jobs.service.js";
import { ApprovalController } from "./approvals/approval.controller.js";
import { ApprovalService } from "./approvals/approval.service.js";
import { SnapshotRepository } from "./publication/snapshot.repository.js";
import { join } from "node:path";
import {
  TranslationsService,
  type I18nFiles,
  type TranslationExecutor,
} from "./translations/translations.service.js";

export type TmsApiOptions = {
  readonly i18nFiles: I18nFiles;
  readonly snapshotRepository?: SnapshotRepository;
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
          provide: "TMS_SNAPSHOT_REPOSITORY",
          useValue:
            options.snapshotRepository ??
            new SnapshotRepository(join(dataDirectory, "published")),
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

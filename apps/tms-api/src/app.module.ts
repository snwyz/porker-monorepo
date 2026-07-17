import { type DynamicModule, Module } from "@nestjs/common";

import { JobRepository, readTmsDataDirectory } from "./jobs/job.repository.js";
import { JobsController } from "./jobs/jobs.controller.js";
import { JobsService } from "./jobs/jobs.service.js";

@Module({})
export class AppModule {
  static forRoot(dataDirectory = readTmsDataDirectory()): DynamicModule {
    return {
      controllers: [JobsController],
      module: AppModule,
      providers: [
        JobsService,
        {
          provide: JobRepository,
          useFactory: () => new JobRepository(dataDirectory),
        },
      ],
    };
  }
}

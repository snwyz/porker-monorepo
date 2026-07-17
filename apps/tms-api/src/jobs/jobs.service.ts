import { Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { CreateJob, Job } from "./job.schema.js";
import { JobRepository } from "./job.repository.js";

@Injectable()
export class JobsService implements OnModuleInit {
  constructor(private readonly repository: JobRepository) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initialize();
  }

  async create(input: CreateJob): Promise<Job> {
    return this.repository.save({
      ...input,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      status: "QUEUED",
    });
  }

  async find(id: string): Promise<Job> {
    const job = await this.repository.find(id);
    if (!job) {
      throw new NotFoundException("Translation job was not found");
    }
    return job;
  }

  list(): Promise<Job[]> {
    return this.repository.list();
  }

  update(job: Job): Promise<Job> {
    return this.repository.save(job);
  }
}

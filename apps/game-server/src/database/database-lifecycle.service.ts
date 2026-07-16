import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { disconnectDatabase } from "@poker/db";

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  onApplicationShutdown(): Promise<void> {
    return disconnectDatabase();
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from "@nestjs/common";
import { ZodError } from "zod";

import { RoomsService } from "./rooms.service.js";
import { localizedProblem, messageCode } from "../i18n/message-code.js";

@Controller("v1/rooms")
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  list() {
    return this.rooms.list();
  }

  @Post()
  create(@Body() body: unknown) {
    try {
      return this.rooms.create(this.rooms.parseCreateInput(body));
    } catch (error) {
      if (error instanceof ZodError) {
        const field = error.issues[0]?.path[0];
        throw new BadRequestException(
          localizedProblem(messageCode.invalidValue, {
            0: typeof field === "string" ? field : "room",
          }),
        );
      }
      throw error;
    }
  }
}

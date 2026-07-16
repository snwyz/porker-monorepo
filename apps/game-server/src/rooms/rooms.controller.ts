import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from "@nestjs/common";
import { ZodError } from "zod";

import { RoomsService } from "./rooms.service.js";

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
        throw new BadRequestException(error.issues);
      }
      throw error;
    }
  }
}

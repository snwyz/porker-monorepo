import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ZodError } from "zod";

import { GuestService, type GuestIdentity } from "./guest.service.js";
import { localizedProblem, messageCode } from "../i18n/message-code.js";

interface CookieRequest {
  cookies?: Record<string, unknown>;
}

interface CookieResponse {
  cookie(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      maxAge: number;
      path: string;
    },
  ): void;
}

@Controller("v1/guest-session")
export class GuestController {
  constructor(private readonly guests: GuestService) {}

  @Post()
  async create(
    @Body() body: { nickname?: unknown },
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<GuestIdentity> {
    try {
      const result = await this.guests.createOrReuse(
        this.guests.parseNickname(body.nickname),
        request.cookies?.poker_session as string | undefined,
      );
      if (result.token) {
        response.cookie("poker_session", result.token, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60 * 1_000,
          path: "/",
        });
      }
      return result.identity;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException(
          localizedProblem(messageCode.invalidValue, { 0: "nickname" }),
        );
      }
      throw error;
    }
  }
}

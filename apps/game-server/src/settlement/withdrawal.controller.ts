import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from "@nestjs/common";

import { WithdrawalService } from "./withdrawal.service.js";

interface CookieRequest {
  cookies?: Record<string, unknown>;
}

@Controller("v1/withdrawals")
export class WithdrawalController {
  constructor(private readonly withdrawals: WithdrawalService) {}

  @Post()
  request(
    @Req() request: CookieRequest,
    @Body() body: { amount?: unknown },
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.withdrawals.request(
      request.cookies?.poker_session,
      body.amount,
      idempotencyKey,
    );
  }

  @Get(":id")
  get(@Req() request: CookieRequest, @Param("id") id: string) {
    return this.withdrawals.get(request.cookies?.poker_session, id);
  }
}

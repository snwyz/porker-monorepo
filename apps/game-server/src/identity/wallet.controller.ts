import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
} from "@nestjs/common";

import type { AppMode } from "../config/app-mode.js";
import { APP_MODE } from "../config/tokens.js";
import {
  WalletService,
  type IssuedWalletNonce,
  type WalletIdentity,
} from "./wallet.service.js";

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

interface CookieRequest {
  cookies?: Record<string, unknown>;
}

@Controller("v1/wallet")
export class WalletController {
  constructor(
    private readonly wallets: WalletService,
    @Inject(APP_MODE) private readonly mode: AppMode,
  ) {}

  private ensureWeb3(): void {
    if (this.mode !== "web3") throw new NotFoundException();
  }

  @Post("nonce")
  issue(@Body() body: { address?: unknown }): Promise<IssuedWalletNonce> {
    this.ensureWeb3();
    return this.wallets.issueNonce(this.wallets.parseAddress(body.address));
  }

  @Post("verify")
  async verify(
    @Body() body: { message?: unknown; signature?: unknown },
    @Res({ passthrough: true }) response: CookieResponse,
  ): Promise<WalletIdentity> {
    this.ensureWeb3();
    const result = await this.wallets.verify(body.message, body.signature);
    response.cookie("poker_session", result.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1_000,
      path: "/",
    });
    return result.identity;
  }


  @Get("balance")
  balance(@Req() request: CookieRequest) {
    this.ensureWeb3();
    return this.wallets.balance(request.cookies?.poker_session);
  }
}

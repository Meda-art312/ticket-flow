import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { services, Services } from "./infra/services";
import { apiRouter, health, registry } from "./http";
import { config } from "./infra/config";
import { log } from "./infra/metrics";
import swaggerUi from "swagger-ui-express";
import contract from "../docs/openapi.json";
import { StripeTest } from "./payments/provider";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
@Module({})
class ApiModule {}
export async function createApp(s: Services = services()) {
  if (s.payments.adapter instanceof StripeTest)
    await s.payments.adapter.verifyAccount();
  const app = await NestFactory.create<NestExpressApplication>(ApiModule, {
    rawBody: true,
    logger: false,
  });
  app.use(helmet());
  app.useBodyParser("json", { limit: "64kb" });
  app.set("trust proxy", false);
  app.use("/api/v1", apiRouter(s));
  app.use((error: any, req: any, res: any, _next: any) => {
    const request_id = req.request_id || randomUUID();
    res.setHeader("X-Request-ID", request_id);
    res
      .status(error.status === 413 ? 413 : error.status === 400 ? 400 : 500)
      .json({
        code:
          error.status === 413
            ? "REQUEST_TOO_LARGE"
            : error.status === 400
              ? "INVALID_JSON"
              : "INTERNAL_ERROR",
        message:
          error.status === 413
            ? "Request exceeds 64kb"
            : error.status === 400
              ? "Malformed JSON"
              : "Internal server error",
        request_id,
      });
  });
  const express = app.getHttpAdapter().getInstance();
  express.get("/health/live", (_req: any, res: any) =>
    res.json({ status: "live" }),
  );
  express.get("/health/ready", async (_req: any, res: any) => {
    try {
      res.json(await health(s));
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });
  express.get("/metrics", async (_req: any, res: any) =>
    res.type(registry.contentType).send(await registry.metrics()),
  );
  if (config.APP_MODE !== "production")
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(contract));
  await app.init();
  return { app, s };
}
async function main() {
  const { app, s } = await createApp();
  await app.listen(config.PORT, "0.0.0.0");
  log("api_started", { port: config.PORT, mode: config.APP_MODE });
  let stopping = false;
  const close = async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    await s.cache.close();
    await s.db.close();
  };
  process.on("SIGTERM", () => void close());
  process.on("SIGINT", () => void close());
}
if (require.main === module)
  void main().catch(() => {
    log("api_start_failed");
    process.exitCode = 1;
  });

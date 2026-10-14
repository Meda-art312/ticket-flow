import { z } from "zod";
const schema = z.object({
  APP_MODE: z.enum(["local", "test", "production"]),
  PAYMENT_PROVIDER: z.enum(["simulator", "stripe_test"]).default("simulator"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://redis:6379"),
  RABBITMQ_URL: z.string().default("amqp://guest:guest@rabbitmq:5672"),
  JWT_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().min(32),
  SIMULATOR_SECRET: z.string().min(32).optional(),
  INTERNAL_SECRET: z.string().min(32).optional(),
  FRONTEND_ORIGIN: z.url().default("http://localhost:8080"),
  PUBLIC_API_URL: z.url().default("http://localhost:3000"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  RESERVATION_SECONDS: z.coerce.number().int().min(1).max(3600).default(600),
  PORT: z.coerce.number().default(3000),
  SMTP_HOST: z.string().default("mailpit"),
  SMTP_PORT: z.coerce.number().default(1025),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_ACCOUNT_ID: z.string().optional(),
  ARGON_MEMORY: z.coerce.number().int().min(19456).default(19456),
  ARGON_TIME: z.coerce.number().int().min(2).default(2),
});
export const config = schema.parse(process.env);
if (
  new URL(config.FRONTEND_ORIGIN).origin !== config.FRONTEND_ORIGIN ||
  !["http:", "https:"].includes(new URL(config.FRONTEND_ORIGIN).protocol)
)
  throw new Error("FRONTEND_ORIGIN must be an exact origin");
if (!["http:", "https:"].includes(new URL(config.PUBLIC_API_URL).protocol))
  throw new Error("PUBLIC_API_URL must use HTTP(S)");
if (
  [config.FRONTEND_ORIGIN, config.PUBLIC_API_URL].some(
    (url) => new URL(url).protocol === "https:",
  ) &&
  config.COOKIE_SECURE !== "true"
)
  throw new Error("HTTPS requires COOKIE_SECURE=true");
if (
  config.STRIPE_SECRET_KEY &&
  !config.STRIPE_SECRET_KEY.startsWith("sk_test_")
)
  throw new Error("Only Stripe test keys are permitted");
if (
  config.PAYMENT_PROVIDER === "stripe_test" &&
  (!config.STRIPE_SECRET_KEY ||
    !config.STRIPE_WEBHOOK_SECRET ||
    !config.STRIPE_ACCOUNT_ID)
)
  throw new Error("Stripe test configuration incomplete");
if (
  config.APP_MODE === "production" &&
  (config.PAYMENT_PROVIDER === "simulator" ||
    config.COOKIE_SECURE !== "true" ||
    process.env.SEED_PASSWORD ||
    [config.JWT_SECRET, config.TOKEN_ENCRYPTION_KEY].some((v) =>
      v.startsWith("local-"),
    ) ||
    config.SIMULATOR_SECRET ||
    config.INTERNAL_SECRET)
)
  throw new Error("Unsafe production configuration");
if (config.PAYMENT_PROVIDER === "simulator" && !config.SIMULATOR_SECRET)
  throw new Error("Simulator secret required");
if (
  config.APP_MODE !== "local" &&
  config.APP_MODE !== "test" &&
  config.RESERVATION_SECONDS !== 600
)
  throw new Error("Short holds are local/test only");

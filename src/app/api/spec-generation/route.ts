import {
  createSpecGenerationPostHandler,
  requestTopDownGameSpecFromProvider,
} from "@/service/spec-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createSpecGenerationPostHandler({
  env: process.env,
  provider: requestTopDownGameSpecFromProvider,
});

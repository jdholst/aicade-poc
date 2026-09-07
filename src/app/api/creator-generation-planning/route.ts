import {
  createCreatorGenerationPlanningPostHandler,
} from "@/service/creator-generation-planning/creator-generation-planning-route-handler";
import { TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS } from "@/service/creator-generation-planning/creator-generation-planning-policy";
import { requestCreatorGenerationPlanFromProvider } from "@/service/creator-generation-planning/creator-generation-planning-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createCreatorGenerationPlanningPostHandler({
  availableCapabilities: TOP_DOWN_CREATOR_GENERATION_HOST_CAPABILITY_IDS,
  env: process.env,
  provider: requestCreatorGenerationPlanFromProvider,
});

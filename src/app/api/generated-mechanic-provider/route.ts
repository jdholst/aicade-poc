import { createGeneratedMechanicProviderPostHandler } from "@/service/generated-mechanic-provider/generated-mechanic-provider-route-handler";
import { requestGeneratedMechanicContractFromProvider } from "@/service/mechanic-contract-generation/mechanic-contract-generation-provider";
import { requestGeneratedMechanicSourceFromProvider } from "@/service/mechanic-source-generation/mechanic-source-generation-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createGeneratedMechanicProviderPostHandler({
  contractProvider: requestGeneratedMechanicContractFromProvider,
  env: process.env,
  sourceProvider: requestGeneratedMechanicSourceFromProvider,
});

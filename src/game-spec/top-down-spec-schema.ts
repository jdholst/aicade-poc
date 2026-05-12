import { z } from "zod";

import {
  gameSpecSchema,
  jsonValueSchema,
  stableIdSchema,
} from "./game-spec-schema";

const finiteNumberSchema = z.number().finite();
const positiveNumberSchema = finiteNumberSchema.positive();
const coordinateSchema = finiteNumberSchema;
const stableIdListSchema = z.array(stableIdSchema).min(1);

const topDownArenaSchema = z
  .object({
    id: stableIdSchema,
    width: positiveNumberSchema,
    height: positiveNumberSchema,
  })
  .strict();

const topDownWallSchema = z
  .object({
    id: stableIdSchema,
    x: coordinateSchema,
    y: coordinateSchema,
    width: positiveNumberSchema,
    height: positiveNumberSchema,
  })
  .strict();

const topDownRectObstacleSchema = z
  .object({
    id: stableIdSchema,
    shape: z.literal("rect"),
    x: coordinateSchema,
    y: coordinateSchema,
    width: positiveNumberSchema,
    height: positiveNumberSchema,
  })
  .strict();

const topDownCircleObstacleSchema = z
  .object({
    id: stableIdSchema,
    shape: z.literal("circle"),
    x: coordinateSchema,
    y: coordinateSchema,
    radius: positiveNumberSchema,
  })
  .strict();

const topDownObstacleSchema = z.discriminatedUnion("shape", [
  topDownRectObstacleSchema,
  topDownCircleObstacleSchema,
]);

const topDownSpawnZoneSchema = z
  .object({
    id: stableIdSchema,
    x: coordinateSchema,
    y: coordinateSchema,
    width: positiveNumberSchema,
    height: positiveNumberSchema,
    entityIds: stableIdListSchema.optional(),
  })
  .strict();

const topDownPickupZoneSchema = z
  .object({
    id: stableIdSchema,
    x: coordinateSchema,
    y: coordinateSchema,
    width: positiveNumberSchema,
    height: positiveNumberSchema,
    assetIds: stableIdListSchema.optional(),
  })
  .strict();

const topDownRegionSchema = z
  .object({
    id: stableIdSchema,
    label: z.string().min(1).max(80),
    x: coordinateSchema,
    y: coordinateSchema,
    width: positiveNumberSchema,
    height: positiveNumberSchema,
  })
  .strict();

const topDownLayoutSchema = z
  .object({
    walls: z.array(topDownWallSchema),
    obstacles: z.array(topDownObstacleSchema),
    spawnZones: z.array(topDownSpawnZoneSchema),
    pickupZones: z.array(topDownPickupZoneSchema),
    regions: z.array(topDownRegionSchema),
  })
  .strict();

const topDownSceneSchema = z
  .object({
    id: stableIdSchema,
    name: z.string().min(1).max(80),
    objectiveIds: stableIdListSchema.optional(),
    validationGoalIds: stableIdListSchema.optional(),
    arena: topDownArenaSchema,
    layout: topDownLayoutSchema,
  })
  .strict();

export const topDownSpecSchema = z
  .object({
    scenes: z.array(topDownSceneSchema).min(1).max(1),
    extensions: z.record(z.string(), jsonValueSchema).optional(),
  })
  .strict();

export const topDownGameSpecSchema = gameSpecSchema.extend({
  template: z
    .object({
      id: z.literal("template_top_down"),
      version: z.string().min(1).max(40),
      config: topDownSpecSchema,
    })
    .strict(),
});

export function parseTopDownSpec(input: unknown): TopDownSpec {
  return topDownSpecSchema.parse(input);
}

export function parseTopDownGameSpec(input: unknown): TopDownGameSpec {
  return topDownGameSpecSchema.parse(input);
}

export type TopDownSpec = z.infer<typeof topDownSpecSchema>;
export type TopDownGameSpec = z.infer<typeof topDownGameSpecSchema>;
export type TopDownScene = z.infer<typeof topDownSceneSchema>;
export type TopDownArena = z.infer<typeof topDownArenaSchema>;
export type TopDownWall = z.infer<typeof topDownWallSchema>;
export type TopDownObstacle = z.infer<typeof topDownObstacleSchema>;
export type TopDownSpawnZone = z.infer<typeof topDownSpawnZoneSchema>;
export type TopDownPickupZone = z.infer<typeof topDownPickupZoneSchema>;
export type TopDownRegion = z.infer<typeof topDownRegionSchema>;

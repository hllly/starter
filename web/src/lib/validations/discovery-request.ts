import { z } from "zod";

export const createDiscoveryRequestSchema = z.object({
  productCategory: z
    .string()
    .min(1, "请填写目标品类")
    .max(200),
  targetRegions: z
    .array(z.string().min(1))
    .min(1, "请至少选择一个目标地区")
    .max(20),
  buyerTypes: z
    .array(z.string().min(1))
    .min(1, "请至少选择一种客户类型")
    .max(10),
  priorityDirection: z
    .string()
    .min(1, "请填写优先方向")
    .max(500),
  advancedOptions: z
    .object({
      exclusionRules: z.string().max(1000).optional(),
      supplyNotes: z.string().max(1000).optional(),
      extraNotes: z.string().max(2000).optional(),
    })
    .optional(),
});

export type CreateDiscoveryRequestInput = z.infer<typeof createDiscoveryRequestSchema>;

import { z } from "zod";

export const leadFeedbackSchema = z.object({
  action: z.enum(["interested", "not_fit", "contacted"]),
  reason: z
    .enum(["type_mismatch", "too_small", "duplicate", "info_insufficient", "other"])
    .optional(),
  note: z.string().max(500).optional(),
});

export type LeadFeedbackInput = z.infer<typeof leadFeedbackSchema>;

export const leadStatusUpdateSchema = z.object({
  status: z.enum(["following", "paused", "no_interest"]),
  note: z.string().max(500).optional(),
});

export type LeadStatusUpdateInput = z.infer<typeof leadStatusUpdateSchema>;

export const batchFeedbackSchema = z.object({
  helpfulness: z.enum(["helpful", "neutral", "not_helpful"]),
  note: z.string().max(1000).optional(),
});

export type BatchFeedbackInput = z.infer<typeof batchFeedbackSchema>;

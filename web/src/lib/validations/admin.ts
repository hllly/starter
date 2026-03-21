import { z } from "zod";

const leadPayloadSchema = z.object({
  company_name: z.string().min(1),
  website: z.string().optional().nullable(),
  country_region: z.string().min(1),
  buyer_type: z.enum([
    "importer", "distributor", "wholesaler",
    "brand_sourcing", "chain_retail_buyer", "trading_company", "unknown",
  ]),
  source_type: z.enum([
    "industry_directory", "association", "customs_data",
    "marketplace", "exhibitor_list", "company_website", "other",
  ]),
  source_url: z.string().optional().nullable(),
  source_platform: z.string().optional().nullable(),
  recommendation_reason: z.string().min(1),
  recommended_action: z
    .enum(["contact_now", "contact_if_fit", "observe", "contact_maybe", "deprioritize"])
    .optional()
    .nullable(),
  current_tier: z.enum(["recommended", "observation"]),
  linkedin_url: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
});

export const reviewReadyPayloadSchema = z.object({
  run_info: z.object({
    run_id: z.string().min(1),
    summary_text: z.string().optional(),
  }),
  batch_summary: z.object({
    recommended_count: z.number().int().min(0),
    observation_count: z.number().int().min(0),
    source_summary: z.string().optional(),
    source_breakdown: z
      .array(z.object({ type: z.string(), count: z.number().int().min(0) }))
      .optional(),
  }),
  quality_meta: z.object({
    platform_count: z.number().int().optional(),
    platform_accessible: z.number().int().optional(),
    platform_verified_companies: z.number().int().optional(),
    companies_extracted: z.number().int().optional(),
    companies_new: z.number().int().optional(),
    review_queue_rows: z.number().int().optional(),
    candidate_total: z.number().int().optional(),
    candidate_no_domain: z.number().int().optional(),
    collapsed_by_dedupe: z.number().int().optional(),
    platform_blocked: z.number().int().optional(),
    extract_timeout: z.number().int().optional(),
    bootstrap_platforms_scored: z.number().int().optional(),
    bootstrap_hard_gate_pass: z.number().int().optional(),
    bootstrap_promoted: z.number().int().optional(),
    bootstrap_avg_confidence: z.number().optional(),
    run_quality: z.string().optional(),
    bucket_saturated: z.boolean().optional(),
    bucket_saturation_info: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  leads: z.array(leadPayloadSchema),
});

export type ReviewReadyPayload = z.infer<typeof reviewReadyPayloadSchema>;

export const rejectPayloadSchema = z.object({
  failureType: z.enum(["execution_error", "quality_rejected", "invalid_input"]),
  reviewNote: z.string().max(1000).optional(),
});

export type RejectPayload = z.infer<typeof rejectPayloadSchema>;

export const failPayloadSchema = z.object({
  failureType: z.enum(["execution_error", "quality_rejected", "invalid_input"]),
  errorSummary: z.string().max(2000).optional(),
});

export type FailPayload = z.infer<typeof failPayloadSchema>;

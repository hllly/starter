-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'claimed', 'running', 'awaiting_review', 'published', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "FailureType" AS ENUM ('execution_error', 'quality_rejected', 'invalid_input');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('approved', 'rejected');

-- CreateEnum
CREATE TYPE "ResultQuality" AS ENUM ('normal', 'low_yield', 'empty');

-- CreateEnum
CREATE TYPE "LeadBuyerType" AS ENUM ('importer', 'distributor', 'wholesaler', 'brand_sourcing', 'chain_retail_buyer', 'trading_company', 'unknown');

-- CreateEnum
CREATE TYPE "LeadSourceType" AS ENUM ('industry_directory', 'association', 'customs_data', 'marketplace', 'exhibitor_list', 'company_website', 'other');

-- CreateEnum
CREATE TYPE "LeadTier" AS ENUM ('recommended', 'observation');

-- CreateEnum
CREATE TYPE "RecommendedAction" AS ENUM ('contact_now', 'contact_if_fit', 'observe', 'contact_maybe', 'deprioritize');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'interested', 'dismissed', 'contacted', 'following', 'paused', 'no_interest');

-- CreateEnum
CREATE TYPE "FeedbackAction" AS ENUM ('interested', 'not_fit', 'contacted');

-- CreateEnum
CREATE TYPE "FeedbackReason" AS ENUM ('type_mismatch', 'too_small', 'duplicate', 'info_insufficient', 'other');

-- CreateEnum
CREATE TYPE "Helpfulness" AS ENUM ('helpful', 'neutral', 'not_helpful');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('active', 'watching', 'following', 'archived', 'excluded');

-- CreateEnum
CREATE TYPE "MatchLevel" AS ENUM ('high', 'medium', 'low', 'unknown');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('not_started', 'partial', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "ProfileQuality" AS ENUM ('high', 'medium', 'low', 'unknown');

-- CreateEnum
CREATE TYPE "ProfileRequestStatus" AS ENUM ('queued', 'claimed', 'running', 'completed', 'pr_failed', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "onboarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_business_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "main_category" TEXT NOT NULL,
    "sub_categories" TEXT NOT NULL,
    "target_regions" JSONB NOT NULL,
    "target_buyer_types" JSONB NOT NULL,
    "excluded_buyer_types" JSONB,
    "product_positioning" TEXT NOT NULL,
    "target_customer_desc" TEXT NOT NULL,
    "website_url" TEXT,
    "core_selling_points" TEXT,
    "moq_price_range" TEXT,
    "customer_scale_pref" TEXT,
    "exclusion_conditions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_category" TEXT NOT NULL,
    "target_regions" JSONB NOT NULL,
    "buyer_types" JSONB NOT NULL,
    "priority_direction" TEXT NOT NULL,
    "advanced_options" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "discovery_request_id" UUID NOT NULL,
    "user_id" UUID,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "claimed_at" TIMESTAMP(3),
    "claimed_by" TEXT,
    "started_at" TIMESTAMP(3),
    "review_ready_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "review_decision" "ReviewDecision",
    "review_note" TEXT,
    "failure_type" "FailureType",
    "error_summary" TEXT,
    "run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_result_summaries" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "summary_text" TEXT,
    "recommended_count" INTEGER NOT NULL DEFAULT 0,
    "observation_count" INTEGER NOT NULL DEFAULT 0,
    "source_summary_text" TEXT,
    "source_summary_json" JSONB,
    "result_quality" "ResultQuality" NOT NULL DEFAULT 'normal',
    "quality_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_result_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "website" TEXT,
    "root_domain" TEXT,
    "country_region" TEXT,
    "linkedin_url" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "discovery_request_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "source_type" "LeadSourceType",
    "source_platform" TEXT,
    "source_url" TEXT,
    "buyer_type" "LeadBuyerType",
    "current_tier" "LeadTier" NOT NULL,
    "recommendation_reason" TEXT,
    "recommended_action" "RecommendedAction",
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_feedback" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" "FeedbackAction" NOT NULL,
    "reason" "FeedbackReason",
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_feedback" (
    "id" UUID NOT NULL,
    "discovery_request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "helpfulness" "Helpfulness" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_pool_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "pool_status" "PoolStatus" NOT NULL DEFAULT 'active',
    "match_level" "MatchLevel" NOT NULL DEFAULT 'unknown',
    "pool_score" INTEGER,
    "root_domain" TEXT,
    "company_role" TEXT,
    "business_model" TEXT,
    "buyer_fit" TEXT,
    "buyer_fit_reason" TEXT,
    "product_categories_summary" TEXT,
    "target_markets_summary" TEXT,
    "first_seen_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "appear_count" INTEGER NOT NULL DEFAULT 0,
    "source_count" INTEGER NOT NULL DEFAULT 0,
    "latest_lead_id" UUID,
    "latest_request_id" UUID,
    "latest_lead_status" TEXT,
    "profile_status" "ProfileStatus" NOT NULL DEFAULT 'not_started',
    "profile_quality" "ProfileQuality" NOT NULL DEFAULT 'unknown',
    "profile_last_updated_at" TIMESTAMP(3),
    "top_contact_email" TEXT,
    "top_contact_phone" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pool_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profiles" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "root_domain" TEXT,
    "profile_status" "ProfileStatus" NOT NULL DEFAULT 'not_started',
    "profile_quality" "ProfileQuality" NOT NULL DEFAULT 'unknown',
    "profile_run_id" TEXT,
    "profile_version" INTEGER,
    "profile_first_built_at" TIMESTAMP(3),
    "profile_last_updated_at" TIMESTAMP(3),
    "email_best" TEXT,
    "email_alt" TEXT,
    "phone_best" TEXT,
    "phone_alt" TEXT,
    "contact_page_url" TEXT,
    "contact_form_url" TEXT,
    "linkedin_company_url" TEXT,
    "country" TEXT,
    "state_region" TEXT,
    "city" TEXT,
    "address_raw" TEXT,
    "founded_year" TEXT,
    "business_model" TEXT,
    "company_role" TEXT,
    "buyer_fit" TEXT,
    "buyer_fit_reason" TEXT,
    "product_categories" TEXT,
    "core_products" TEXT,
    "target_markets" TEXT,
    "industry_focus" TEXT,
    "import_signal" TEXT,
    "oem_odm_signal" TEXT,
    "private_label_signal" TEXT,
    "vendor_onboarding_signal" TEXT,
    "moq_sample_signal" TEXT,
    "procurement_signal_notes" TEXT,
    "employee_range" TEXT,
    "revenue_range" TEXT,
    "facility_signal" TEXT,
    "certifications" TEXT,
    "evidence_urls" JSONB,
    "evidence_notes" TEXT,
    "pages_visited_count" INTEGER,
    "raw_profile_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profile_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" "ProfileRequestStatus" NOT NULL DEFAULT 'queued',
    "claimed_by" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "run_id" TEXT,
    "error_summary" TEXT,
    "result_summary" TEXT,

    CONSTRAINT "company_profile_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "user_business_profiles_user_id_key" ON "user_business_profiles"("user_id");

-- CreateIndex
CREATE INDEX "discovery_requests_user_id_idx" ON "discovery_requests"("user_id");

-- CreateIndex
CREATE INDEX "discovery_requests_status_idx" ON "discovery_requests"("status");

-- CreateIndex
CREATE INDEX "discovery_requests_created_at_idx" ON "discovery_requests"("created_at");

-- CreateIndex
CREATE INDEX "jobs_discovery_request_id_idx" ON "jobs"("discovery_request_id");

-- CreateIndex
CREATE INDEX "jobs_user_id_idx" ON "jobs"("user_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_result_summaries_job_id_key" ON "job_result_summaries"("job_id");

-- CreateIndex
CREATE INDEX "companies_website_idx" ON "companies"("website");

-- CreateIndex
CREATE INDEX "companies_root_domain_idx" ON "companies"("root_domain");

-- CreateIndex
CREATE INDEX "companies_normalized_name_country_region_idx" ON "companies"("normalized_name", "country_region");

-- CreateIndex
CREATE INDEX "leads_discovery_request_id_idx" ON "leads"("discovery_request_id");

-- CreateIndex
CREATE INDEX "leads_company_id_idx" ON "leads"("company_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "lead_feedback_lead_id_idx" ON "lead_feedback"("lead_id");

-- CreateIndex
CREATE INDEX "lead_feedback_user_id_idx" ON "lead_feedback"("user_id");

-- CreateIndex
CREATE INDEX "batch_feedback_discovery_request_id_idx" ON "batch_feedback"("discovery_request_id");

-- CreateIndex
CREATE INDEX "batch_feedback_user_id_idx" ON "batch_feedback"("user_id");

-- CreateIndex
CREATE INDEX "customer_pool_items_user_id_pool_status_idx" ON "customer_pool_items"("user_id", "pool_status");

-- CreateIndex
CREATE INDEX "customer_pool_items_user_id_match_level_idx" ON "customer_pool_items"("user_id", "match_level");

-- CreateIndex
CREATE INDEX "customer_pool_items_user_id_profile_status_idx" ON "customer_pool_items"("user_id", "profile_status");

-- CreateIndex
CREATE INDEX "customer_pool_items_last_seen_at_idx" ON "customer_pool_items"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_pool_items_user_id_company_id_key" ON "customer_pool_items"("user_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_company_id_key" ON "company_profiles"("company_id");

-- CreateIndex
CREATE INDEX "company_profiles_profile_status_idx" ON "company_profiles"("profile_status");

-- CreateIndex
CREATE INDEX "company_profiles_profile_quality_idx" ON "company_profiles"("profile_quality");

-- CreateIndex
CREATE INDEX "company_profile_requests_company_id_status_idx" ON "company_profile_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "company_profile_requests_status_requested_at_idx" ON "company_profile_requests"("status", "requested_at");

-- AddForeignKey
ALTER TABLE "user_business_profiles" ADD CONSTRAINT "user_business_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_requests" ADD CONSTRAINT "discovery_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_discovery_request_id_fkey" FOREIGN KEY ("discovery_request_id") REFERENCES "discovery_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_result_summaries" ADD CONSTRAINT "job_result_summaries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_discovery_request_id_fkey" FOREIGN KEY ("discovery_request_id") REFERENCES "discovery_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_feedback" ADD CONSTRAINT "lead_feedback_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_feedback" ADD CONSTRAINT "lead_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_feedback" ADD CONSTRAINT "batch_feedback_discovery_request_id_fkey" FOREIGN KEY ("discovery_request_id") REFERENCES "discovery_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_feedback" ADD CONSTRAINT "batch_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_pool_items" ADD CONSTRAINT "customer_pool_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_pool_items" ADD CONSTRAINT "customer_pool_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profile_requests" ADD CONSTRAINT "company_profile_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profile_requests" ADD CONSTRAINT "company_profile_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom partial unique indexes (not expressible in Prisma schema)
CREATE UNIQUE INDEX IF NOT EXISTS "companies_website_unique"
  ON "companies" ("website")
  WHERE "website" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "companies_name_region_unique"
  ON "companies" ("normalized_name", "country_region")
  WHERE "website" IS NULL;

-- SA-10: churn scoring, weekly growth recommendations, the report builder,
-- its scheduler, and ad-hoc export jobs.

CREATE TYPE "ChurnRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ReportSource" AS ENUM ('SCHOOLS', 'REVENUE', 'USERS', 'TICKETS', 'USAGE', 'FEATURE_ADOPTION');
CREATE TYPE "ReportSchedule" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "ReportRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "ExportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED');

-- ── Churn risk ──────────────────────────────────────────────────────
CREATE TABLE "churn_risk_scores" (
  "id"                 TEXT NOT NULL,
  "school_id"          TEXT NOT NULL,
  "batch_id"           TEXT NOT NULL,
  "level"              "ChurnRiskLevel" NOT NULL,
  "score"              INTEGER NOT NULL,
  "primary_reason"     TEXT NOT NULL,
  "recommended_action" TEXT NOT NULL,
  "signals"            JSONB NOT NULL,
  "generated"          BOOLEAN NOT NULL DEFAULT false,
  "is_latest"          BOOLEAN NOT NULL DEFAULT true,
  "computed_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "churn_risk_scores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "churn_risk_scores_school_id_batch_id_key" ON "churn_risk_scores"("school_id", "batch_id");
CREATE INDEX "churn_risk_scores_is_latest_level_idx" ON "churn_risk_scores"("is_latest", "level");
CREATE INDEX "churn_risk_scores_school_id_computed_at_idx" ON "churn_risk_scores"("school_id", "computed_at");
ALTER TABLE "churn_risk_scores"
  ADD CONSTRAINT "churn_risk_scores_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Growth recommendations ──────────────────────────────────────────
CREATE TABLE "growth_recommendations" (
  "id"           TEXT NOT NULL,
  "batch_id"     TEXT NOT NULL,
  "rank"         INTEGER NOT NULL,
  "title"        TEXT NOT NULL,
  "rationale"    TEXT NOT NULL,
  "action"       TEXT NOT NULL,
  "impact"       TEXT NOT NULL,
  "effort"       TEXT NOT NULL,
  "based_on"     TEXT[] DEFAULT ARRAY[]::TEXT[],
  "generated"    BOOLEAN NOT NULL DEFAULT false,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_recommendations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "growth_recommendations_batch_id_rank_key" ON "growth_recommendations"("batch_id", "rank");
CREATE INDEX "growth_recommendations_generated_at_idx" ON "growth_recommendations"("generated_at");

-- ── Report builder ──────────────────────────────────────────────────
CREATE TABLE "report_configs" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  "source"        "ReportSource" NOT NULL,
  "fields"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "filters"       JSONB NOT NULL DEFAULT '[]',
  "sort_field"    TEXT,
  "sort_dir"      TEXT NOT NULL DEFAULT 'desc',
  "row_limit"     INTEGER,
  "schedule"      "ReportSchedule" NOT NULL DEFAULT 'NONE',
  "recipients"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "created_by_id" TEXT NOT NULL,
  "last_run_at"   TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_configs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "report_configs_schedule_idx" ON "report_configs"("schedule");
CREATE INDEX "report_configs_created_by_id_idx" ON "report_configs"("created_by_id");

CREATE TABLE "report_run_logs" (
  "id"           TEXT NOT NULL,
  "config_id"    TEXT NOT NULL,
  "status"       "ReportRunStatus" NOT NULL DEFAULT 'RUNNING',
  "trigger"      TEXT NOT NULL DEFAULT 'manual',
  "rows"         INTEGER,
  "download_url" TEXT,
  "expires_at"   TIMESTAMP(3),
  "delivery"     JSONB,
  "error"        TEXT,
  "started_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at"  TIMESTAMP(3),
  "duration_ms"  INTEGER,
  CONSTRAINT "report_run_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "report_run_logs_config_id_started_at_idx" ON "report_run_logs"("config_id", "started_at");
ALTER TABLE "report_run_logs"
  ADD CONSTRAINT "report_run_logs_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "report_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Ad-hoc exports ──────────────────────────────────────────────────
CREATE TABLE "export_jobs" (
  "id"              TEXT NOT NULL,
  "status"          "ExportJobStatus" NOT NULL DEFAULT 'QUEUED',
  "source"          "ReportSource" NOT NULL,
  "format"          TEXT NOT NULL DEFAULT 'xlsx',
  "filters"         JSONB NOT NULL DEFAULT '{}',
  "filename"        TEXT NOT NULL,
  "rows"            INTEGER,
  "bytes"           INTEGER,
  "error"           TEXT,
  "expires_at"      TIMESTAMP(3),
  "requested_by_id" TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at"     TIMESTAMP(3),
  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "export_jobs_requested_by_id_created_at_idx" ON "export_jobs"("requested_by_id", "created_at");

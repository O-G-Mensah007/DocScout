CREATE TYPE "public"."practice_status" AS ENUM('accepting', 'accepting_with_conditions', 'waitlist_only', 'not_accepting', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."practice_type" AS ENUM('FHT', 'FHO', 'FHG', 'CHC', 'NPLC', 'AHAC', 'solo', 'walk_in', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('practice_website', 'booking_platform', 'google_business', 'intake_form', 'phone_call', 'practice_submission', 'open_data');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('automated_extraction', 'human_phone', 'practice_submission');--> statement-breakpoint
CREATE TABLE "audit_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" text NOT NULL,
	"reason" text NOT NULL,
	"machine_status" "practice_status",
	"human_status" "practice_status",
	"agreed" boolean,
	"notes" text,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" text NOT NULL,
	"reported_status" "practice_status",
	"kind" text NOT NULL,
	"message" text,
	"from_practice" boolean DEFAULT false NOT NULL,
	"contact_email" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" text NOT NULL,
	"status" "practice_status" NOT NULL,
	"conditions" jsonb,
	"intake_method" text,
	"intake_url" text,
	"evidence_quote" text,
	"snapshot_id" uuid,
	"method" "verification_method" NOT NULL,
	"confidence" double precision NOT NULL,
	"model" text,
	"reasoning" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "practice_type" DEFAULT 'other' NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"postal" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"catchment" text NOT NULL,
	"website_url" text,
	"booking_url" text,
	"phone" text,
	"mds" integer,
	"nps" integer,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_status" "practice_status" DEFAULT 'unknown' NOT NULL,
	"current_conditions" jsonb,
	"current_intake_method" text,
	"current_intake_url" text,
	"current_evidence_quote" text,
	"current_evidence_url" text,
	"current_snapshot_id" uuid,
	"verified_at" timestamp with time zone,
	"verification_method" "verification_method",
	"confidence" double precision,
	"last_human_check" timestamp with time zone,
	"recheck_due" timestamp with time zone,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_confidence" double precision,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"roster_updated_at" timestamp with time zone,
	"delisted_at" timestamp with time zone,
	"crawl_blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" text NOT NULL,
	"source_url" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"http_status" integer,
	"content_hash" text NOT NULL,
	"body" text NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"postal" text NOT NULL,
	"radius_km" integer DEFAULT 10 NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accept_np" boolean DEFAULT true NOT NULL,
	"accept_conditional" boolean DEFAULT true NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_tasks" ADD CONSTRAINT "audit_tasks_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_open_idx" ON "audit_tasks" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "audit_reason_idx" ON "audit_tasks" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "observations_practice_idx" ON "observations" USING btree ("practice_id","observed_at");--> statement-breakpoint
CREATE INDEX "practices_catchment_idx" ON "practices" USING btree ("catchment");--> statement-breakpoint
CREATE INDEX "practices_status_idx" ON "practices" USING btree ("current_status");--> statement-breakpoint
CREATE INDEX "practices_recheck_idx" ON "practices" USING btree ("recheck_due");--> statement-breakpoint
CREATE INDEX "practices_postal_idx" ON "practices" USING btree ("postal");--> statement-breakpoint
CREATE INDEX "practices_needs_review_idx" ON "practices" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "snapshots_practice_idx" ON "snapshots" USING btree ("practice_id","retrieved_at");--> statement-breakpoint
CREATE INDEX "snapshots_hash_idx" ON "snapshots" USING btree ("practice_id","content_hash");--> statement-breakpoint
CREATE INDEX "watches_postal_idx" ON "watches" USING btree ("postal");--> statement-breakpoint
CREATE UNIQUE INDEX "watches_email_postal_idx" ON "watches" USING btree ("email","postal");
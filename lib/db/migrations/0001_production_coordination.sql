CREATE TABLE "lab_synthesis_audit" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"snapshot_id" varchar(64) NOT NULL,
	"user_id" text NOT NULL,
	"action" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_synthesis_requests" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"week_of" varchar(10) NOT NULL,
	"image_hash" varchar(64) NOT NULL,
	"user_id" text NOT NULL,
	"status" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone NOT NULL,
	"snapshot_id" varchar(64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lab_synthesis_requests_running_scope_week" ON "lab_synthesis_requests" USING btree ("scope","week_of") WHERE "lab_synthesis_requests"."status" = 'running';
CREATE TABLE "lab_group_states" (
	"id" varchar(96) PRIMARY KEY NOT NULL,
	"synthesis_id" varchar(64) NOT NULL,
	"snapshot_id" varchar(64),
	"group_id" varchar(64) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"week_of" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" jsonb NOT NULL,
	"before_state" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"match_method" varchar(64),
	"match_confidence" integer,
	"status_reason" text
);
--> statement-breakpoint
CREATE TABLE "lab_groups" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"project" text NOT NULL,
	"students" text[] NOT NULL,
	"color" varchar(32) DEFAULT 'teal' NOT NULL,
	"status" varchar(32) DEFAULT 'On track' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_focus" text DEFAULT '' NOT NULL,
	"blocker" text,
	"phase" varchar(64),
	"summary" text,
	"last_updated" varchar(10) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_snapshots" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"week_of" varchar(10) NOT NULL,
	"file_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" varchar(32) DEFAULT 'seed' NOT NULL,
	"image_hash" varchar(64),
	"target_group_id" varchar(64),
	"groups" jsonb NOT NULL,
	"unmatched_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"wins" text[] NOT NULL,
	"attention_items" text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_group_states" ADD CONSTRAINT "lab_group_states_snapshot_id_lab_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."lab_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_group_states" ADD CONSTRAINT "lab_group_states_group_id_lab_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."lab_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_snapshots" ADD CONSTRAINT "lab_snapshots_target_group_id_lab_groups_id_fk" FOREIGN KEY ("target_group_id") REFERENCES "public"."lab_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lab_group_states_synthesis_group_unique" ON "lab_group_states" USING btree ("synthesis_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_group_states_group_week_unique" ON "lab_group_states" USING btree ("group_id","week_of");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_snapshots_one_synthesis_per_week" ON "lab_snapshots" USING btree ("week_of") WHERE "lab_snapshots"."source" = 'synthesis';--> statement-breakpoint
CREATE UNIQUE INDEX "lab_snapshots_one_group_synthesis_per_week" ON "lab_snapshots" USING btree ("week_of","target_group_id") WHERE "lab_snapshots"."source" = 'group-synthesis';
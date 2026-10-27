CREATE TABLE "forecast_locks" (
	"id" text PRIMARY KEY NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "forecast_scores" (
	"lock_id" text NOT NULL,
	"source" text NOT NULL,
	"scope" text NOT NULL,
	"n" integer NOT NULL,
	"correct" real NOT NULL,
	"brier" real,
	"log_loss" real,
	"avg_winner_prob" real,
	"margin_n" integer DEFAULT 0 NOT NULL,
	"margin_bias" real,
	"margin_mae" real,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forecast_scores_lock_id_source_scope_pk" PRIMARY KEY("lock_id","source","scope")
);
--> statement-breakpoint
CREATE TABLE "forecasts" (
	"lock_id" text NOT NULL,
	"race_key" text NOT NULL,
	"source" text NOT NULL,
	"dem_win_prob" real,
	"margin" real,
	"detail" jsonb NOT NULL,
	CONSTRAINT "forecasts_lock_id_race_key_source_pk" PRIMARY KEY("lock_id","race_key","source")
);
--> statement-breakpoint
ALTER TABLE "forecast_scores" ADD CONSTRAINT "forecast_scores_lock_id_forecast_locks_id_fk" FOREIGN KEY ("lock_id") REFERENCES "public"."forecast_locks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_lock_id_forecast_locks_id_fk" FOREIGN KEY ("lock_id") REFERENCES "public"."forecast_locks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_race_key_races_key_fk" FOREIGN KEY ("race_key") REFERENCES "public"."races"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forecasts_source" ON "forecasts" USING btree ("lock_id","source");
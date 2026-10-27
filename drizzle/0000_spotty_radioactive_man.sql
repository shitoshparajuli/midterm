CREATE TABLE "candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_key" text NOT NULL,
	"name" text NOT NULL,
	"party" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"race_key" text NOT NULL,
	"party" text NOT NULL,
	"candidate_name" text,
	"external_id" text NOT NULL,
	"token_id" text,
	"series_ticker" text,
	"event_id" text NOT NULL,
	"question" text NOT NULL,
	"url" text NOT NULL,
	"volume" real DEFAULT 0 NOT NULL,
	"last_price" real,
	"last_price_at" timestamp with time zone,
	"status" text NOT NULL,
	"outcome" integer,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"step" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"race_key" text,
	"poll_type" text NOT NULL,
	"subject" text,
	"seat_name" text,
	"pollster" text NOT NULL,
	"sponsors" text[] DEFAULT '{}' NOT NULL,
	"partisan" text,
	"internal" boolean DEFAULT false NOT NULL,
	"population" text,
	"sample_size" integer,
	"start_date" date,
	"end_date" date NOT NULL,
	"url" text,
	"dem_pct" real,
	"rep_pct" real,
	"margin" real,
	"answers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pollsters" (
	"name" text PRIMARY KEY NOT NULL,
	"affiliation" text,
	"house_effect" real,
	"house_effect_n" integer DEFAULT 0 NOT NULL,
	"lean" text,
	"lean_source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_points" (
	"market_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"price" real NOT NULL,
	CONSTRAINT "price_points_market_id_ts_pk" PRIMARY KEY("market_id","ts")
);
--> statement-breakpoint
CREATE TABLE "races" (
	"key" text PRIMARY KEY NOT NULL,
	"office" text NOT NULL,
	"state" text,
	"district" integer,
	"title" text NOT NULL,
	"election_date" date DEFAULT '2026-11-03' NOT NULL,
	"winner_party" text,
	"dem_pct" real,
	"rep_pct" real,
	"called_at" timestamp with time zone,
	"result_source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_race_key_races_key_fk" FOREIGN KEY ("race_key") REFERENCES "public"."races"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_race_key_races_key_fk" FOREIGN KEY ("race_key") REFERENCES "public"."races"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_race_key_races_key_fk" FOREIGN KEY ("race_key") REFERENCES "public"."races"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_points" ADD CONSTRAINT "price_points_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_race_name" ON "candidates" USING btree ("race_key","name");--> statement-breakpoint
CREATE INDEX "markets_race" ON "markets" USING btree ("race_key");--> statement-breakpoint
CREATE INDEX "polls_race" ON "polls" USING btree ("race_key");--> statement-breakpoint
CREATE INDEX "polls_pollster" ON "polls" USING btree ("pollster");
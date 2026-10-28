CREATE TABLE "pageviews" (
	"race_key" text NOT NULL,
	"day" date NOT NULL,
	"article" text NOT NULL,
	"views" integer NOT NULL,
	CONSTRAINT "pageviews_race_key_day_pk" PRIMARY KEY("race_key","day")
);
--> statement-breakpoint
ALTER TABLE "forecast_locks" ADD COLUMN "watch" jsonb;--> statement-breakpoint
ALTER TABLE "pageviews" ADD CONSTRAINT "pageviews_race_key_races_key_fk" FOREIGN KEY ("race_key") REFERENCES "public"."races"("key") ON DELETE no action ON UPDATE no action;
SET local check_function_bodies = off;

CREATE TABLE "public"."champion_pools" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "roster_member_id" uuid                     NOT NULL,
  "champion_name"    text                     NOT NULL,
  "comfort"          integer                  NOT NULL DEFAULT 3,
  "notes"            text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "champion_pools_champion_name_check" CHECK (((char_length(TRIM(BOTH FROM champion_name)) >= 1) AND (char_length(TRIM(BOTH FROM champion_name)) <= 40))),
  CONSTRAINT "champion_pools_comfort_check" CHECK (((comfort >= 1) AND (comfort <= 5))),
  CONSTRAINT "champion_pools_notes_check" CHECK (((notes IS NULL) OR (char_length(notes) <= 300))),
  CONSTRAINT "champion_pools_pkey" PRIMARY KEY (id),
  "user_id"          uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."champion_pools"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."draft_plans" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "plan_name"      text                     NOT NULL,
  "opponent_name"  text                     NOT NULL,
  "patch"          text                     NOT NULL DEFAULT ''::text,
  "team_side"      text                     NOT NULL DEFAULT 'blue'::text,
  "priority_picks" text[]                   NOT NULL DEFAULT '{}'::text[],
  "priority_bans"  text[]                   NOT NULL DEFAULT '{}'::text[],
  "notes"          text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "draft_plans_notes_check" CHECK (((notes IS NULL) OR (char_length(notes) <= 1000))),
  CONSTRAINT "draft_plans_opponent_name_check" CHECK (((char_length(TRIM(BOTH FROM opponent_name)) >= 1) AND (char_length(TRIM(BOTH FROM opponent_name)) <= 100))),
  CONSTRAINT "draft_plans_patch_check" CHECK ((char_length(patch) <= 20)),
  CONSTRAINT "draft_plans_pkey" PRIMARY KEY (id),
  CONSTRAINT "draft_plans_plan_name_check" CHECK (((char_length(TRIM(BOTH FROM plan_name)) >= 1) AND (char_length(TRIM(BOTH FROM plan_name)) <= 80))),
  CONSTRAINT "draft_plans_priority_bans_check" CHECK ((cardinality(priority_bans) <= 5)),
  CONSTRAINT "draft_plans_priority_picks_check" CHECK ((cardinality(priority_picks) <= 5)),
  CONSTRAINT "draft_plans_team_side_check" CHECK ((team_side = ANY (ARRAY['blue'::text, 'red'::text]))),
  "user_id"        uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."draft_plans"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."match_player_stats" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "match_id"         uuid                     NOT NULL,
  "roster_member_id" uuid                     NOT NULL,
  "kills"            integer                  NOT NULL DEFAULT 0,
  "deaths"           integer                  NOT NULL DEFAULT 0,
  "assists"          integer                  NOT NULL DEFAULT 0,
  "cs"               integer                  NOT NULL DEFAULT 0,
  "vision_score"     integer                  NOT NULL DEFAULT 0,
  "notes"            text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "match_player_stats_assists_check" CHECK (((assists >= 0) AND (assists <= 9999))),
  CONSTRAINT "match_player_stats_cs_check" CHECK (((cs >= 0) AND (cs <= 9999))),
  CONSTRAINT "match_player_stats_deaths_check" CHECK (((deaths >= 0) AND (deaths <= 9999))),
  CONSTRAINT "match_player_stats_kills_check" CHECK (((kills >= 0) AND (kills <= 9999))),
  CONSTRAINT "match_player_stats_notes_check" CHECK (((notes IS NULL) OR (char_length(notes) <= 500))),
  CONSTRAINT "match_player_stats_one_per_player_per_match" UNIQUE (match_id, roster_member_id),
  CONSTRAINT "match_player_stats_pkey" PRIMARY KEY (id),
  CONSTRAINT "match_player_stats_vision_score_check" CHECK (((vision_score >= 0) AND (vision_score <= 9999))),
  "user_id"          uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."match_player_stats"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."matches" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "opponent_name"  text                     NOT NULL,
  "played_on"      date                     NOT NULL,
  "our_score"      integer                  NOT NULL,
  "opponent_score" integer                  NOT NULL,
  "notes"          text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "draft_plan_id"  uuid,
  CONSTRAINT "matches_opponent_name_check" CHECK (((char_length(TRIM(BOTH FROM opponent_name)) >= 1) AND (char_length(TRIM(BOTH FROM opponent_name)) <= 100))),
  CONSTRAINT "matches_opponent_score_check" CHECK (((opponent_score >= 0) AND (opponent_score <= 99))),
  CONSTRAINT "matches_our_score_check" CHECK (((our_score >= 0) AND (our_score <= 99))),
  CONSTRAINT "matches_pkey" PRIMARY KEY (id),
  "user_id"        uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."matches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."review_notes" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "scrim_id"                uuid                     NOT NULL,
  "roster_member_id"        uuid,
  "video_timestamp_seconds" integer                  NOT NULL,
  "category"                text                     NOT NULL,
  "note"                    text                     NOT NULL,
  "action_item"             text,
  "status"                  text                     NOT NULL DEFAULT 'open'::text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "review_notes_action_item_check" CHECK (((action_item IS NULL) OR (char_length(action_item) <= 500))),
  CONSTRAINT "review_notes_category_check"
    CHECK ((category = ANY (ARRAY['mistake'::text, 'strength'::text, 'objective'::text, 'draft'::text, 'communication'::text, 'other'::text]))),
  CONSTRAINT "review_notes_note_check" CHECK (((char_length(TRIM(BOTH FROM note)) >= 1) AND (char_length(TRIM(BOTH FROM note)) <= 1000))),
  CONSTRAINT "review_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "review_notes_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'done'::text]))),
  CONSTRAINT "review_notes_video_timestamp_seconds_check" CHECK (((video_timestamp_seconds >= 0) AND (video_timestamp_seconds <= 36000))),
  "user_id"                 uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."review_notes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."roster_members" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "player_name" text                     NOT NULL,
  "role"        text                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "roster_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "roster_members_player_name_check" CHECK (((char_length(TRIM(BOTH FROM player_name)) >= 1) AND (char_length(TRIM(BOTH FROM player_name)) <= 80))),
  CONSTRAINT "roster_members_role_check" CHECK ((role = ANY (ARRAY['top'::text, 'jungle'::text, 'mid'::text, 'bottom'::text, 'support'::text, 'substitute'::text]))),
  "user_id"     uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."roster_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scrims" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "opponent_name" text                     NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL,
  "session_type"  text                     NOT NULL DEFAULT 'scrim'::text,
  "status"        text                     NOT NULL DEFAULT 'planned'::text,
  "notes"         text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scrims_opponent_name_check" CHECK (((char_length(TRIM(BOTH FROM opponent_name)) >= 1) AND (char_length(TRIM(BOTH FROM opponent_name)) <= 100))),
  CONSTRAINT "scrims_pkey" PRIMARY KEY (id),
  CONSTRAINT "scrims_session_type_check" CHECK ((session_type = ANY (ARRAY['scrim'::text, 'vod_review'::text]))),
  CONSTRAINT "scrims_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text]))),
  "user_id"       uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."scrims"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_draft_plan_id_fkey" FOREIGN KEY (draft_plan_id) REFERENCES public.draft_plans(id) ON DELETE SET NULL;

ALTER TABLE "public"."match_player_stats"
  ADD CONSTRAINT "match_player_stats_match_id_fkey" FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE "public"."champion_pools"
  ADD CONSTRAINT "champion_pools_roster_member_id_fkey" FOREIGN KEY (roster_member_id) REFERENCES public.roster_members(id) ON DELETE CASCADE;

ALTER TABLE "public"."match_player_stats"
  ADD CONSTRAINT "match_player_stats_roster_member_id_fkey" FOREIGN KEY (roster_member_id) REFERENCES public.roster_members(id) ON DELETE CASCADE;

ALTER TABLE "public"."review_notes"
  ADD CONSTRAINT "review_notes_roster_member_id_fkey" FOREIGN KEY (roster_member_id) REFERENCES public.roster_members(id) ON DELETE SET NULL;

ALTER TABLE "public"."review_notes"
  ADD CONSTRAINT "review_notes_scrim_id_fkey" FOREIGN KEY (scrim_id) REFERENCES public.scrims(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX champion_pools_member_champion_unique ON public.champion_pools USING btree (roster_member_id, lower(champion_name));

CREATE INDEX matches_draft_plan_id_idx ON public.matches USING btree (draft_plan_id);

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."champion_pools" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."champion_pools" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."champion_pools" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."champion_pools" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."draft_plans" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."draft_plans" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."draft_plans" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."draft_plans" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."match_player_stats" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."match_player_stats" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."match_player_stats" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."match_player_stats" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."matches" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."matches" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."matches" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."matches" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."review_notes" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."review_notes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."review_notes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."review_notes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_members" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."roster_members" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_members" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_members" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scrims" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."scrims" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scrims" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scrims" TO "service_role";

ALTER TABLE "public"."champion_pools"
  ADD CONSTRAINT "champion_pools_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Users can delete their own champion pools" ON "public"."champion_pools"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own champion pools" ON "public"."champion_pools"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

ALTER TABLE "public"."draft_plans"
  ADD CONSTRAINT "draft_plans_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Users can add their own draft plans" ON "public"."draft_plans"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own draft plans" ON "public"."draft_plans"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own draft plans" ON "public"."draft_plans"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view their own draft plans" ON "public"."draft_plans"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

ALTER TABLE "public"."match_player_stats"
  ADD CONSTRAINT "match_player_stats_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX match_player_stats_user_match_idx ON public.match_player_stats USING btree (user_id, match_id);

CREATE POLICY "Users can add their own player match stats" ON "public"."match_player_stats"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.matches m
  WHERE (m.id = match_player_stats.match_id))) AND (EXISTS ( SELECT 1
   FROM public.roster_members r
  WHERE (r.id = match_player_stats.roster_member_id)))));

CREATE POLICY "Users can delete their own player match stats" ON "public"."match_player_stats"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own player match stats" ON "public"."match_player_stats"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.matches m
  WHERE (m.id = match_player_stats.match_id))) AND (EXISTS ( SELECT 1
   FROM public.roster_members r
  WHERE (r.id = match_player_stats.roster_member_id)))));

CREATE POLICY "Users can view their own player match stats" ON "public"."match_player_stats"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

ALTER TABLE "public"."matches"
  ADD CONSTRAINT "matches_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Users can add their own matches" ON "public"."matches"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((auth.uid() = user_id) AND ((draft_plan_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.draft_plans dp
  WHERE ((dp.id = matches.draft_plan_id) AND (dp.user_id = auth.uid())))))));

CREATE POLICY "Users can delete their own matches" ON "public"."matches"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own matches" ON "public"."matches"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK (((auth.uid() = user_id) AND ((draft_plan_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.draft_plans dp
  WHERE ((dp.id = matches.draft_plan_id) AND (dp.user_id = auth.uid())))))));

CREATE POLICY "Users can view their own matches" ON "public"."matches"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

ALTER TABLE "public"."review_notes"
  ADD CONSTRAINT "review_notes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX review_notes_user_created_idx ON public.review_notes USING btree (user_id, created_at DESC);

CREATE POLICY "Users can delete their own review notes" ON "public"."review_notes"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own review notes" ON "public"."review_notes"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

ALTER TABLE "public"."roster_members"
  ADD CONSTRAINT "roster_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Users can add their own champion pools" ON "public"."champion_pools"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.roster_members rm
  WHERE ((rm.id = champion_pools.roster_member_id) AND (rm.user_id = auth.uid()))))));

CREATE POLICY "Users can add to their own roster" ON "public"."roster_members"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete from their own roster" ON "public"."roster_members"
  FOR DELETE
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own roster" ON "public"."roster_members"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view their own roster" ON "public"."roster_members"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

ALTER TABLE "public"."scrims"
  ADD CONSTRAINT "scrims_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "Users can add their own review notes" ON "public"."review_notes"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.scrims s
  WHERE ((s.id = review_notes.scrim_id) AND (s.user_id = auth.uid())))) AND ((roster_member_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.roster_members rm
  WHERE ((rm.id = review_notes.roster_member_id) AND (rm.user_id = auth.uid())))))));

CREATE POLICY "Users can update their own review notes" ON "public"."review_notes"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.scrims s
  WHERE ((s.id = review_notes.scrim_id) AND (s.user_id = auth.uid())))) AND ((roster_member_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.roster_members rm
  WHERE ((rm.id = review_notes.roster_member_id) AND (rm.user_id = auth.uid())))))));

CREATE POLICY "Users can create their own scrims" ON "public"."scrims"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can delete their own scrims" ON "public"."scrims"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can update their own scrims" ON "public"."scrims"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can view their own scrims" ON "public"."scrims"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));


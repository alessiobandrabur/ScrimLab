import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import Link from "next/link";
import { Suspense } from "react";
type SearchParams = Promise<{
  q?: string | string[];
  type?: string | string[];
  status?: string | string[];
  period?: string | string[];
  notice?: string | string[];
}>;
const navigation = [
  { label: "Overview", href: "#overview", icon: "◈" },
  { label: "Roster", href: "#roster", icon: "◎" },
  { label: "Schedule", href: "#schedule", icon: "◷" },
  { label: "Draft prep", href: "#draft-prep", icon: "◇" },
  { label: "Matches", href: "#matches", icon: "⌁" },
  { label: "Analytics", href: "#analytics", icon: "▥" },
  { label: "Player stats", href: "#player-performance", icon: "↗" },
];
const roles = ["top", "jungle", "mid", "bottom", "support", "substitute"];
export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-400">Loading ScrimLab…</p>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}
async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const getParam = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const search = getParam(params.q).trim();
  const type = getParam(params.type);
  const status = getParam(params.status);
  const period = getParam(params.period) || "upcoming";
  const notice = getParam(params.notice);
  const supabase = await createClient();
  const now = new Date().toISOString();
  let scrimQuery = supabase
    .from("scrims")
    .select("id, opponent_name, scheduled_for, session_type, status, notes")
    .order("scheduled_for", { ascending: period !== "past" });
  if (period === "upcoming") scrimQuery = scrimQuery.gte("scheduled_for", now);
  if (period === "past") scrimQuery = scrimQuery.lt("scheduled_for", now);
  if (type === "scrim" || type === "vod_review") {
    scrimQuery = scrimQuery.eq("session_type", type);
  }
  if (status === "planned" || status === "confirmed") {
    scrimQuery = scrimQuery.eq("status", status);
  }
  if (search) scrimQuery = scrimQuery.ilike("opponent_name", `%${search}%`);
  const [
    { data: scrims, error: scrimsError },
    { count: upcomingScrims },
    { count: upcomingReviews },
    { data: roster, error: rosterError },
    { data: matches, error: matchesError },
    { data: championPools, error: championPoolsError },
    { data: draftPlans, error: draftPlansError },
    { data: draftActions, error: draftActionsError },
    { data: reviewSessions, error: reviewSessionsError },
    { data: reviewNotes, error: reviewNotesError },
    { data: playerMatchStats, error: playerMatchStatsError },
  ] = await Promise.all([
    scrimQuery.limit(100),
    supabase
      .from("scrims")
      .select("id", { count: "exact", head: true })
      .eq("session_type", "scrim")
      .gte("scheduled_for", now),
    supabase
      .from("scrims")
      .select("id", { count: "exact", head: true })
      .eq("session_type", "vod_review")
      .gte("scheduled_for", now),
    supabase
      .from("roster_members")
      .select("id, player_name, role")
      .order("created_at", { ascending: true }),
    supabase
      .from("matches")
      .select("id, opponent_name, played_on, our_score, opponent_score, notes, draft_plan_id")
      .order("played_on", { ascending: false })
      .limit(100),
    supabase
      .from("champion_pools")
      .select("id, roster_member_id, champion_name, comfort, notes")
      .order("comfort", { ascending: false })
      .order("champion_name", { ascending: true }),
    supabase
      .from("draft_plans")
      .select("id, plan_name, opponent_name, patch, team_side, priority_picks, priority_bans, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("draft_actions")
      .select("draft_plan_id, turn_number, team, action_type, champion_name")
      .order("turn_number", { ascending: true }),
    supabase
      .from("scrims")
      .select("id, opponent_name, scheduled_for")
      .eq("session_type", "vod_review")
      .order("scheduled_for", { ascending: false })
      .limit(100),
    supabase
      .from("review_notes")
      .select("id, scrim_id, roster_member_id, video_timestamp_seconds, category, note, action_item, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("match_player_stats")
      .select("id, match_id, roster_member_id, kills, deaths, assists, cs, vision_score, notes")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const championNames = [...new Set((championPools ?? []).map((pick) => pick.champion_name))];
  const savedMatches = matches ?? [];
  const wins = savedMatches.filter((match) => match.our_score > match.opponent_score).length;
  const winRate = savedMatches.length
    ? `${Math.round((wins / savedMatches.length) * 100)}%`
    : "—";
  const weeklyActivity = buildWeeklyActivity(savedMatches);
  const matchesById = new Map(savedMatches.map((match) => [match.id, match]));
  const plansById = new Map((draftPlans ?? []).map((plan) => [plan.id, plan]));
  const reviewSessionById = new Map((reviewSessions ?? []).map((session) => [session.id, session]));
  const rosterById = new Map((roster ?? []).map((member) => [member.id, member]));
  const statsByMatch = new Map<string, NonNullable<typeof playerMatchStats>>();
  for (const stat of playerMatchStats ?? []) {
    const group = statsByMatch.get(stat.match_id) ?? [];
    group.push(stat);
    statsByMatch.set(stat.match_id, group);
  }
  const playerPerformance = new Map<string, { games: number; kills: number; deaths: number; assists: number; cs: number; vision: number }>();
  for (const stat of playerMatchStats ?? []) {
    const totals = playerPerformance.get(stat.roster_member_id) ?? { games: 0, kills: 0, deaths: 0, assists: 0, cs: 0, vision: 0 };
    totals.games += 1;
    totals.kills += stat.kills;
    totals.deaths += stat.deaths;
    totals.assists += stat.assists;
    totals.cs += stat.cs;
    totals.vision += stat.vision_score;
    playerPerformance.set(stat.roster_member_id, totals);
  }
  const championStats = new Map<string, { games: number; wins: number; draws: number }>();
  for (const match of savedMatches) {
    if (!match.draft_plan_id) continue;
    const plan = plansById.get(match.draft_plan_id);
    if (!plan) continue;
    for (const pick of (draftActions ?? []).filter((action) => action.draft_plan_id === plan.id && action.team === plan.team_side && action.action_type === "pick" && action.champion_name)) {
      const stats = championStats.get(pick.champion_name!) ?? { games: 0, wins: 0, draws: 0 };
      stats.games += 1;
      if (match.our_score > match.opponent_score) stats.wins += 1;
      else if (match.our_score === match.opponent_score) stats.draws += 1;
      championStats.set(pick.champion_name!, stats);
    }
  }
  const championDraftStats = [...championStats.entries()]
    .map(([champion, stats]) => ({ champion, ...stats, winRate: Math.round((stats.wins / stats.games) * 100) }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
  const noticeText: Record<string, string> = {
    session_added: "Session added.",
    session_updated: "Session updated.",
    session_deleted: "Session deleted.",
    player_added: "Player added to the roster.",
    player_updated: "Player details updated.",
    player_deleted: "Player removed from the roster.",
    match_added: "Match result saved.",
    match_updated: "Match result updated.",
    match_deleted: "Match result deleted.",
    champion_added: "Champion added to the player’s pool.",
    champion_deleted: "Champion removed from the pool.",
    draft_added: "Draft plan saved.",
    draft_updated: "Draft plan updated.",
    draft_deleted: "Draft plan removed.",
    draft_board_saved: "Pick and ban board saved.",
    match_invalid_draft: "Choose one of your own saved draft plans.",
    review_note_added: "VOD review note added.",
    review_note_updated: "VOD review note updated.",
    review_note_deleted: "VOD review note deleted.",
    player_stats_added: "Player performance saved.",
    player_stats_updated: "Player performance updated.",
    player_stats_deleted: "Player performance deleted.",
    player_stats_invalid: "Check the selected match, player, and non-negative stat values.",
    player_stats_duplicate: "This player already has stats for this match. Edit their existing entry instead.",
    review_invalid: "Check the timestamp, note, and selected review session.",
    draft_invalid: "A champion can only appear once in the board. Use a different champion or leave the slot empty.",
    error: "We couldn’t save that change. Check the VS Code terminal.",
  };
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-slate-950 p-5 lg:flex">
          <Link href="#overview" className="mb-10 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 font-black text-slate-950">
              S
            </span>
            <span>
              <span className="block text-lg font-bold tracking-wide">SCRIMLAB</span>
              <span className="block text-xs text-slate-500">TEAM OPERATIONS</span>
            </span>
          </Link>
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Workspace
          </p>
          <nav className="space-y-1">
            {navigation.map((item, index) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  index === 0
                    ? "bg-emerald-400/10 font-semibold text-emerald-300"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="w-5 text-center">{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold">ScrimLab Beta</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Your team workspace is ready to build.
            </p>
            <div className="mt-4 h-1.5 rounded-full bg-white/10">
              <div className="h-1.5 w-1/4 rounded-full bg-emerald-400" />
            </div>
            <p className="mt-2 text-xs text-slate-500">Setup progress · 25%</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex h-16 items-center justify-between border-b border-white/10 px-5 sm:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-400 font-black text-slate-950">
                S
              </span>
              <span className="font-bold tracking-wide">SCRIMLAB</span>
            </div>
            <p className="hidden text-sm text-slate-400 lg:block">
              Team workspace <span className="mx-2 text-slate-700">/</span>
              <span className="text-slate-200">Overview</span>
            </p>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:block">BETA WORKSPACE</span>
              <Suspense fallback={<span className="text-sm text-slate-500">Loading…</span>}>
                <AuthButton />
              </Suspense>
            </div>
          </header>
          <div id="overview" className="mx-auto max-w-7xl space-y-8 p-5 sm:p-8">
            {noticeText[notice] && (
              <p
                role="status"
                className={`rounded-lg border px-4 py-3 text-sm ${
                  notice === "error"
                    ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                }`}
              >
                {noticeText[notice]}
              </p>
            )}
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-emerald-300">TEAM OVERVIEW</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                  Welcome to ScrimLab
                </h1>
                <p className="mt-2 text-slate-400">
                  Your team’s preparation, schedule, and performance in one place.
                </p>
              </div>
              <details className="relative shrink-0">
                <summary className="cursor-pointer list-none rounded-lg bg-emerald-400 px-4 py-2.5 text-center text-sm font-semibold text-slate-950 hover:bg-emerald-300 [&::-webkit-details-marker]:hidden">
                  + Add a scrim
                </summary>
                <ScrimForm action={addScrim} buttonText="Save session" />
              </details>
            </section>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Upcoming scrims" value={String(upcomingScrims ?? 0)} detail="Future scrim blocks" />
              <MetricCard label="Upcoming VOD reviews" value={String(upcomingReviews ?? 0)} detail="Future review sessions" />
              <MetricCard label="Roster" value={rosterError ? "—" : `${roster?.length ?? 0} players`} detail="Saved roster members" />
              <MetricCard label="Win rate" value={matchesError ? "—" : winRate} detail={`Latest ${savedMatches.length} saved matches`} />
            </section>
            <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
              <div id="schedule" className="rounded-2xl border border-white/10 bg-slate-900/60">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="font-semibold">Scrim schedule</h2>
                    <p className="mt-1 text-xs text-slate-500">Search and filter sessions</p>
                  </div>
                  <span className="text-xs text-slate-500">{scrims?.length ?? 0} shown · maximum 100</span>
                </div>
                <form method="get" action="/" className="grid gap-2 border-b border-white/10 p-4 sm:grid-cols-2 xl:grid-cols-5">
                  <input name="q" defaultValue={search} placeholder="Search opponent" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                  <select name="type" defaultValue={type} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm">
                    <option value="">All session types</option>
                    <option value="scrim">Scrim block</option>
                    <option value="vod_review">VOD review</option>
                  </select>
                  <select name="status" defaultValue={status} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm">
                    <option value="">All statuses</option>
                    <option value="planned">Planned</option>
                    <option value="confirmed">Confirmed</option>
                  </select>
                  <select name="period" defaultValue={period} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm">
                    <option value="upcoming">Upcoming</option>
                    <option value="past">Past</option>
                    <option value="all">All dates</option>
                  </select>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300">Apply</button>
                    <Link href="/" className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5">Reset</Link>
                  </div>
                </form>
                {scrimsError ? (
                  <p className="px-5 py-4 text-sm text-rose-300">Could not load sessions. Check the VS Code terminal.</p>
                ) : !scrims?.length ? (
                  <p className="px-5 py-6 text-sm text-slate-400">No sessions match those filters.</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {scrims.map((scrim) => (
                      <div key={scrim.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                        <div className="w-20 shrink-0">
                          <p className="text-xs text-slate-400">{formatLondonDate(scrim.scheduled_for)}</p>
                          <p className="mt-1 text-sm font-semibold">{formatLondonTime(scrim.scheduled_for)}</p>
                        </div>
                        <span className="h-9 w-px bg-white/10" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{scrim.opponent_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {scrim.session_type === "vod_review" ? "VOD review" : "Scrim block"}
                            {scrim.notes ? ` · ${scrim.notes}` : ""}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs ${scrim.status === "confirmed" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
                          {capitalize(scrim.status)}
                        </span>
                        <details className="relative">
                          <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm text-emerald-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden">Edit</summary>
                          <ScrimForm action={updateScrim} buttonText="Save changes" scrim={scrim} />
                        </details>
                        <details className="relative">
                          <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-lg text-slate-400 hover:bg-white/10 [&::-webkit-details-marker]:hidden">⋯</summary>
                          <form action={deleteScrim} className="absolute right-0 top-9 z-20 w-56 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl">
                            <input type="hidden" name="scrim_id" value={scrim.id} />
                            <p className="text-sm font-medium">Delete this session?</p>
                            <p className="mt-1 text-xs text-slate-400">“{scrim.opponent_name}” will be removed.</p>
                            <button className="mt-3 w-full rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold hover:bg-rose-400">Delete session</button>
                          </form>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div id="analytics" className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <h2 className="font-semibold">Matches this week</h2>
                <p className="mt-1 text-xs text-slate-500">Saved match results by day</p>
                <div className="mt-8 flex h-40 items-end justify-between gap-3">
                  {weeklyActivity.map((day, index) => (
                    <div key={day.date} className="flex h-full flex-1 flex-col justify-end">
                      <span className="mb-1 text-center text-xs text-slate-400">{day.count}</span>
                      <div
                        className={`w-full rounded-t-md ${index === weeklyActivity.length - 1 ? "bg-emerald-300" : "bg-emerald-400/40"}`}
                        style={{ height: `${day.height}%` }}
                      />
                      <span className="mt-2 text-center text-xs text-slate-500">{day.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 border-t border-white/10 pt-4">
                  <h3 className="text-sm font-semibold">Champion results from linked drafts</h3>
                  <p className="mt-1 text-xs text-slate-500">Based on match results connected to a saved draft plan.</p>
                  {!championDraftStats.length ? (
                    <p className="mt-3 text-xs text-slate-500">Link a match to a draft plan with saved picks to start this report.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {championDraftStats.slice(0, 5).map((item) => (
                        <div key={item.champion} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.champion}</span>
                          <span className="text-[10px] text-slate-500">{item.wins}W–{item.draws}D–{item.games - item.wins - item.draws}L</span>
                          <span className="w-10 text-right text-xs font-semibold text-emerald-300">{item.winRate}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {matchesError && <p className="mt-3 text-xs text-rose-300">Could not load match data.</p>}
              </div>
            </section>
            <section className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
              <div id="roster" className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Active roster</h2>
                    <p className="mt-1 text-xs text-slate-500">League of Legends · Main team</p>
                  </div>
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-lg border border-white/10 px-3 py-2 text-sm text-emerald-300 hover:bg-white/5 [&::-webkit-details-marker]:hidden">+ Add player</summary>
                    <RosterForm action={addRosterMember} buttonText="Save player" />
                  </details>
                </div>
                {rosterError ? (
                  <p className="mt-4 text-sm text-rose-300">Could not load the roster. Check the terminal.</p>
                ) : !roster?.length ? (
                  <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">No players yet. Add your first roster member.</p>
                ) : (
                  <div className="mt-4 divide-y divide-white/5">
                    {roster.map((member) => (
                      <div key={member.id} className="flex items-center gap-3 py-3">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-400/10 text-xs font-bold text-indigo-300">{member.player_name.slice(0, 2).toUpperCase()}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{member.player_name}</p>
                          <p className="mt-1 text-xs text-slate-500">{member.role === "bottom" ? "Adc" : capitalize(member.role)}</p>
                        </div>
                        <details className="relative">
                          <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-xs text-emerald-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden">Edit</summary>
                          <RosterForm action={updateRosterMember} buttonText="Save changes" member={member} />
                        </details>
                        <form action={deleteRosterMember}>
                          <input type="hidden" name="member_id" value={member.id} />
                          <button className="rounded-md px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10">Remove</button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
                <div id="draft-prep" className="mt-5 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Champion pool</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Track each player’s comfort picks for draft prep.</p>
                    </div>
                    {roster?.length ? (
                      <details className="relative">
                        <summary className="cursor-pointer list-none rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-white/5 [&::-webkit-details-marker]:hidden">+ Add champion</summary>
                        <ChampionPoolForm action={addChampionPool} roster={roster} />
                      </details>
                    ) : null}
                  </div>
                  {championPoolsError ? (
                    <p className="mt-4 text-sm text-rose-300">Could not load champion pools. Check the terminal.</p>
                  ) : !roster?.length ? (
                    <p className="mt-4 rounded-lg bg-white/[0.03] p-3 text-xs text-slate-400">Add a roster player first, then you can save their champion pool.</p>
                  ) : !championPools?.length ? (
                    <p className="mt-4 rounded-lg bg-white/[0.03] p-3 text-xs text-slate-400">No champions saved yet. Add a player’s first comfort pick.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {roster.map((member) => {
                        const playerChampions = (championPools ?? []).filter((pick) => pick.roster_member_id === member.id);
                        if (!playerChampions.length) return null;
                        return (
                          <div key={member.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-200">{member.player_name}</p>
                              <span className="text-[10px] text-slate-500">{member.role === "bottom" ? "Adc" : capitalize(member.role)}</span>
                            </div>
                            <div className="space-y-2">
                              {playerChampions.map((pick) => (
                                <div key={pick.id} className="flex items-center gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium">{pick.champion_name}</p>
                                    <p className="mt-0.5 text-[10px] text-slate-500">Comfort {pick.comfort}/5{pick.notes ? ` · ${pick.notes}` : ""}</p>
                                  </div>
                                  <form action={deleteChampionPool}>
                                    <input type="hidden" name="pick_id" value={pick.id} />
                                    <button aria-label={`Remove ${pick.champion_name}`} className="rounded px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10">Remove</button>
                                  </form>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Draft plans</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Save priority picks, bans, and opponent notes for a draft.</p>
                    </div>
                    <details className="relative">
                      <summary className="cursor-pointer list-none rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-white/5 [&::-webkit-details-marker]:hidden">+ New plan</summary>
                      <DraftPlanForm action={saveDraftPlan} buttonText="Save plan" />
                    </details>
                  </div>
                  {draftPlansError ? (
                    <p className="mt-4 text-sm text-rose-300">Could not load draft plans. Check the terminal.</p>
                  ) : !draftPlans?.length ? (
                    <p className="mt-4 rounded-lg bg-white/[0.03] p-3 text-xs text-slate-400">No plans saved yet. Create one for your next opponent.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {draftPlans.map((plan) => (
                        <article key={plan.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                          <div className="flex flex-wrap items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{plan.plan_name}</p>
                              <p className="mt-1 text-xs text-slate-500">vs {plan.opponent_name} · Patch {plan.patch || "unspecified"} · {capitalize(plan.team_side)} side</p>
                            </div>
                            <details className="relative">
                              <summary className="cursor-pointer list-none rounded px-2 py-1 text-xs text-emerald-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden">Edit</summary>
                              <DraftPlanForm action={saveDraftPlan} buttonText="Save changes" plan={plan} />
                            </details>
                            <form action={deleteDraftPlan}>
                              <input type="hidden" name="plan_id" value={plan.id} />
                              <button className="rounded px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10">Delete</button>
                            </form>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Priority picks</p>
                              <div className="mt-1 flex flex-wrap gap-1">{plan.priority_picks.length ? plan.priority_picks.map((champion: string) => <span key={champion} className="rounded bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">{champion}</span>) : <span className="text-xs text-slate-600">None added</span>}</div>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Priority bans</p>
                              <div className="mt-1 flex flex-wrap gap-1">{plan.priority_bans.length ? plan.priority_bans.map((champion: string) => <span key={champion} className="rounded bg-rose-400/10 px-2 py-1 text-[10px] text-rose-200">{champion}</span>) : <span className="text-xs text-slate-600">None added</span>}</div>
                            </div>
                          </div>
                          {plan.notes ? <p className="mt-3 border-t border-white/5 pt-3 text-xs leading-5 text-slate-400">{plan.notes}</p> : null}
                          <details className="mt-3 border-t border-white/5 pt-3">
                            <summary className="cursor-pointer list-none text-xs font-semibold text-emerald-300 [&::-webkit-details-marker]:hidden">Open pick and ban board</summary>
                            {draftActionsError ? (
                              <p className="mt-3 text-xs text-rose-300">Could not load the saved draft board. Check the terminal.</p>
                            ) : (
                              <DraftBoardForm
                                action={saveDraftBoard}
                                planId={plan.id}
                                actions={(draftActions ?? []).filter((action) => action.draft_plan_id === plan.id)}
                                championNames={championNames}
                              />
                            )}
                          </details>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div id="matches" className="rounded-2xl border border-white/10 bg-slate-900/60">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="font-semibold">Recent results</h2>
                    <p className="mt-1 text-xs text-slate-500">Your saved match results</p>
                  </div>
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-lg border border-white/10 px-3 py-2 text-sm text-emerald-300 hover:bg-white/5 [&::-webkit-details-marker]:hidden">+ Add result</summary>
                    <MatchForm action={addMatch} buttonText="Save result" draftPlans={draftPlans ?? []} />
                  </details>
                </div>
                {matchesError ? (
                  <p className="px-5 py-4 text-sm text-rose-300">Could not load results. Check the terminal.</p>
                ) : !matches?.length ? (
                  <p className="px-5 py-6 text-sm text-slate-400">No match results yet. Add your first result.</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {matches.slice(0, 5).map((match) => {
                      const won = match.our_score > match.opponent_score;
                      const tied = match.our_score === match.opponent_score;
                      const result = tied ? "D" : won ? "W" : "L";
                      const tone = tied ? "text-amber-300" : won ? "text-emerald-400" : "text-rose-400";
                      return (
                        <div key={match.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                          <span className={`grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-sm font-bold ${tone}`}>{result}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{match.opponent_name}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDateOnly(match.played_on)}{match.notes ? ` · ${match.notes}` : ""}</p>
                            {match.draft_plan_id && plansById.get(match.draft_plan_id) ? <p className="mt-1 text-[10px] text-emerald-300">Draft: {plansById.get(match.draft_plan_id)?.plan_name}</p> : null}
                          </div>
                          <span className="text-sm font-semibold text-slate-300">{match.our_score} – {match.opponent_score}</span>
                          <details className="relative">
                            <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-xs text-emerald-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden">Edit</summary>
                            <MatchForm action={updateMatch} buttonText="Save changes" match={match} draftPlans={draftPlans ?? []} />
                          </details>
                          <form action={deleteMatch}>
                            <input type="hidden" name="match_id" value={match.id} />
                            <button className="rounded-md px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10">Delete</button>
                          </form>
                          <details className="w-full border-t border-white/5 pt-3">
                            <summary className="cursor-pointer list-none text-xs font-semibold text-emerald-300 [&::-webkit-details-marker]:hidden">Player stats ({(statsByMatch.get(match.id) ?? []).length})</summary>
                            {playerMatchStatsError ? (
                              <p className="mt-3 text-xs text-rose-300">Could not load player stats. Run the player stats SQL, then check the terminal.</p>
                            ) : (
                              <div className="mt-3 space-y-3">
                                {(statsByMatch.get(match.id) ?? []).map((stat) => {
                                  const player = rosterById.get(stat.roster_member_id);
                                  if (!player) return null;
                                  return (
                                    <div key={stat.id} className="rounded-lg border border-white/5 bg-slate-950/60 p-3">
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                          <p className="text-sm font-medium">{player.player_name} <span className="text-xs font-normal text-slate-500">· {player.role === "bottom" ? "Adc" : capitalize(player.role)}</span></p>
                                          <p className="mt-1 text-xs text-slate-400">{stat.kills}/{stat.deaths}/{stat.assists} K/D/A · {stat.cs} CS · {stat.vision_score} vision</p>
                                          {stat.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{stat.notes}</p> : null}
                                        </div>
                                        <div className="flex gap-2">
                                          <details className="relative">
                                            <summary className="cursor-pointer list-none rounded px-2 py-1 text-xs text-emerald-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden">Edit</summary>
                                            <PlayerStatsForm action={updatePlayerStats} buttonText="Save changes" matchId={match.id} roster={roster ?? []} stat={stat} />
                                          </details>
                                          <form action={deletePlayerStats}>
                                            <input type="hidden" name="stat_id" value={stat.id} />
                                            <button className="rounded px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10">Delete</button>
                                          </form>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                {(roster ?? []).some((member) => !(statsByMatch.get(match.id) ?? []).some((stat) => stat.roster_member_id === member.id)) ? (
                                  <details className="relative">
                                    <summary className="cursor-pointer list-none rounded-lg border border-white/10 px-3 py-2 text-xs text-emerald-300 hover:bg-white/5 [&::-webkit-details-marker]:hidden">+ Record a player</summary>
                                    <PlayerStatsForm action={addPlayerStats} buttonText="Save player stats" matchId={match.id} roster={(roster ?? []).filter((member) => !(statsByMatch.get(match.id) ?? []).some((stat) => stat.roster_member_id === member.id))} />
                                  </details>
                                ) : roster?.length ? <p className="text-xs text-slate-500">Every roster member already has stats for this result.</p> : <p className="text-xs text-slate-500">Add players to your roster before recording stats.</p>}
                              </div>
                            )}
                          </details>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
            <section id="player-performance" className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <div>
                <p className="text-sm font-medium text-emerald-300">TEAM ANALYTICS</p>
                <h2 className="mt-1 text-lg font-semibold">Player performance</h2>
                <p className="mt-1 text-xs text-slate-500">Series totals per recorded match. Add stats inside a match result above.</p>
              </div>
              {playerMatchStatsError ? (
                <p className="mt-4 text-sm text-rose-300">Could not load player stats. Run the player stats SQL, then check the terminal.</p>
              ) : !playerMatchStats?.length ? (
                <p className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">No player stats yet. Open a match result and choose “Record a player.”</p>
              ) : (
                <div className="mt-4">
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="pb-2 pr-4">Player</th><th className="pb-2 pr-4">Matches</th><th className="pb-2 pr-4">K / D / A</th><th className="pb-2 pr-4">KDA</th><th className="pb-2 pr-4">Avg CS</th><th className="pb-2">Avg vision</th></tr></thead>
                    <tbody className="divide-y divide-white/5">
                      {[...(roster ?? [])].filter((member) => playerPerformance.has(member.id)).sort((a, b) => (playerPerformance.get(b.id)?.games ?? 0) - (playerPerformance.get(a.id)?.games ?? 0)).map((member) => {
                        const totals = playerPerformance.get(member.id)!;
                        const kda = totals.deaths === 0 ? totals.kills + totals.assists : (totals.kills + totals.assists) / totals.deaths;
                        return <tr key={member.id}><td className="py-3 pr-4 font-medium">{member.player_name}<span className="ml-2 text-xs text-slate-500">{member.role === "bottom" ? "Adc" : capitalize(member.role)}</span></td><td className="py-3 pr-4 text-slate-300">{totals.games}</td><td className="py-3 pr-4 text-slate-300">{totals.kills} / {totals.deaths} / {totals.assists}</td><td className="py-3 pr-4 text-emerald-300">{kda.toFixed(2)}</td><td className="py-3 pr-4 text-slate-300">{(totals.cs / totals.games).toFixed(1)}</td><td className="py-3 text-slate-300">{(totals.vision / totals.games).toFixed(1)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[10px] text-slate-600">KDA = (kills + assists) ÷ deaths. When deaths are zero, it shows kills + assists. CS and vision are averages per recorded match.</p>
                  <div className="mt-6 border-t border-white/5 pt-5">
                    <h3 className="text-sm font-semibold">Recent form</h3>
                    <p className="mt-1 text-xs text-slate-500">KDA across each player’s latest six recorded matches. Hover or tap a point for the opponent and date.</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {[...(roster ?? [])].filter((member) => playerPerformance.has(member.id)).map((member) => {
                        const history = (playerMatchStats ?? [])
                          .filter((stat) => stat.roster_member_id === member.id)
                          .map((stat) => ({ stat, match: matchesById.get(stat.match_id) }))
                          .filter((item): item is { stat: NonNullable<typeof playerMatchStats>[number]; match: NonNullable<typeof matches>[number] } => Boolean(item.match))
                          .sort((a, b) => a.match.played_on.localeCompare(b.match.played_on))
                          .slice(-6)
                          .map(({ stat, match }) => ({
                            opponent: match.opponent_name,
                            playedOn: match.played_on,
                            kda: stat.deaths === 0 ? stat.kills + stat.assists : (stat.kills + stat.assists) / stat.deaths,
                          }));
                        return <PlayerTrendCard key={member.id} playerName={member.player_name} role={member.role} history={history} />;
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
            <section id="vod-review" className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-emerald-300">REVIEW WORKSPACE</p>
                  <h2 className="mt-1 text-lg font-semibold">VOD review notes</h2>
                  <p className="mt-1 text-xs text-slate-500">Record moments, tag players, and track follow-up actions.</p>
                </div>
                {reviewSessions?.length ? (
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 [&::-webkit-details-marker]:hidden">+ Add review note</summary>
                    <ReviewNoteForm action={addReviewNote} sessions={reviewSessions} roster={roster ?? []} buttonText="Save note" />
                  </details>
                ) : null}
              </div>
              {reviewSessionsError || reviewNotesError ? (
                <p className="mt-4 text-sm text-rose-300">Could not load VOD review data. Check the terminal.</p>
              ) : !reviewSessions?.length ? (
                <p className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">Schedule a session with type “VOD review” first. It will appear here as a review you can add notes to.</p>
              ) : !reviewNotes?.length ? (
                <p className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">No review notes yet. Add a timestamped moment from your next VOD session.</p>
              ) : (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {reviewNotes.map((item) => {
                    const session = reviewSessionById.get(item.scrim_id);
                    const player = item.roster_member_id ? rosterById.get(item.roster_member_id) : null;
                    return (
                      <article key={item.id} className="rounded-xl border border-white/5 bg-slate-950/50 p-4">
                        <div className="flex flex-wrap items-start gap-2">
                          <span className="rounded-md bg-emerald-400/10 px-2 py-1 font-mono text-xs font-semibold text-emerald-300">{formatVideoTimestamp(item.video_timestamp_seconds)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{session?.opponent_name ?? "Review session"}</p>
                            <p className="mt-1 text-[10px] text-slate-500">{session ? formatLondonDate(session.scheduled_for) : "Session"}{player ? ` · ${player.player_name}` : " · Team note"}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] ${item.status === "done" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{item.status === "done" ? "Done" : "Open"}</span>
                        </div>
                        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{capitalize(item.category)}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-200">{item.note}</p>
                        {item.action_item ? <p className="mt-3 border-l-2 border-amber-400/50 pl-3 text-xs leading-5 text-slate-400"><span className="font-semibold text-amber-300">Follow-up: </span>{item.action_item}</p> : null}
                        <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
                          <details className="relative">
                            <summary className="cursor-pointer list-none rounded px-2 py-1 text-xs text-emerald-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden">Edit / update status</summary>
                            <ReviewNoteForm action={updateReviewNote} sessions={reviewSessions} roster={roster ?? []} note={item} buttonText="Save changes" />
                          </details>
                          <form action={deleteReviewNote}>
                            <input type="hidden" name="review_note_id" value={item.id} />
                            <button className="rounded px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10">Delete</button>
                          </form>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <p className="pb-4 text-center text-xs text-slate-600">ScrimLab · Built for teams that prepare to win.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
function ScrimForm({
  action,
  buttonText,
  scrim,
}: {
  action: (formData: FormData) => Promise<void>;
  buttonText: string;
  scrim?: {
    id: string;
    opponent_name: string;
    scheduled_for: string;
    session_type: string;
    status: string;
    notes: string | null;
  };
}) {
  return (
    <form action={action} className="absolute right-0 top-9 z-20 w-80 max-w-[90vw] space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl">
      {scrim && <input type="hidden" name="scrim_id" value={scrim.id} />}
      <h3 className="font-semibold">{scrim ? "Edit session" : "Schedule a session"}</h3>
      <label className="block text-sm text-slate-300">Opponent or session name
        <input name="opponent_name" required maxLength={100} defaultValue={scrim?.opponent_name ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm text-slate-300">Date and time
        <input name="scheduled_for" type="datetime-local" required defaultValue={scrim ? londonDateTimeInput(scrim.scheduled_for) : ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm text-slate-300">Session type
        <select name="session_type" defaultValue={scrim?.session_type === "vod_review" ? "vod_review" : "scrim"} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          <option value="scrim">Scrim block</option><option value="vod_review">VOD review</option>
        </select>
      </label>
      <label className="block text-sm text-slate-300">Status
        <select name="status" defaultValue={scrim?.status === "confirmed" ? "confirmed" : "planned"} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          <option value="planned">Planned</option><option value="confirmed">Confirmed</option>
        </select>
      </label>
      <label className="block text-sm text-slate-300">Notes (optional)
        <textarea name="notes" maxLength={1000} rows={3} defaultValue={scrim?.notes ?? ""} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <button className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">{buttonText}</button>
    </form>
  );
}
function RosterForm({
  action,
  buttonText,
  member,
}: {
  action: (formData: FormData) => Promise<void>;
  buttonText: string;
  member?: { id: string; player_name: string; role: string };
}) {
  return (
    <form action={action} className="absolute right-0 top-9 z-20 w-72 space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl">
      {member && <input type="hidden" name="member_id" value={member.id} />}
      <h3 className="font-semibold">{member ? "Edit player" : "Add player"}</h3>
      <label className="block text-sm text-slate-300">Player name / Riot ID
        <input name="player_name" required maxLength={80} defaultValue={member?.player_name ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm text-slate-300">Role
        <select name="role" defaultValue={member?.role ?? "substitute"} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          {roles.map((role) => <option key={role} value={role}>{role === "bottom" ? "Adc" : capitalize(role)}</option>)}
        </select>
      </label>
      <button className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">{buttonText}</button>
    </form>
  );
}
function ChampionPoolForm({
  action,
  roster,
}: {
  action: (formData: FormData) => Promise<void>;
  roster: { id: string; player_name: string; role: string }[];
}) {
  return (
    <form action={action} className="absolute right-0 top-9 z-30 w-80 max-w-[90vw] space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl">
      <h3 className="font-semibold">Add a champion pick</h3>
      <label className="block text-sm text-slate-300">Player
        <select name="roster_member_id" required defaultValue="" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          <option value="" disabled>Select a player</option>
          {roster.map((member) => <option key={member.id} value={member.id}>{member.player_name} · {member.role === "bottom" ? "Adc" : capitalize(member.role)}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-300">Champion name
        <input name="champion_name" required maxLength={40} placeholder="e.g. Ahri" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm text-slate-300">Comfort (1–5)
        <select name="comfort" defaultValue="3" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          <option value="1">1 · Learning</option>
          <option value="2">2 · Developing</option>
          <option value="3">3 · Comfortable</option>
          <option value="4">4 · Strong</option>
          <option value="5">5 · Signature pick</option>
        </select>
      </label>
      <label className="block text-sm text-slate-300">Draft note (optional)
        <input name="notes" maxLength={300} placeholder="Matchup, style, or reminder" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <button className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">Save champion</button>
    </form>
  );
}

const draftSequence = [
  { team: "blue", action: "ban" },
  { team: "red", action: "ban" },
  { team: "blue", action: "ban" },
  { team: "red", action: "ban" },
  { team: "blue", action: "ban" },
  { team: "red", action: "ban" },
  { team: "blue", action: "pick" },
  { team: "red", action: "pick" },
  { team: "red", action: "pick" },
  { team: "blue", action: "pick" },
  { team: "blue", action: "pick" },
  { team: "red", action: "pick" },
  { team: "red", action: "ban" },
  { team: "blue", action: "ban" },
  { team: "red", action: "ban" },
  { team: "blue", action: "ban" },
  { team: "red", action: "pick" },
  { team: "blue", action: "pick" },
  { team: "blue", action: "pick" },
  { team: "red", action: "pick" },
] as const;

function DraftBoardForm({
  action,
  planId,
  actions,
  championNames,
}: {
  action: (formData: FormData) => Promise<void>;
  planId: string;
  actions: { turn_number: number; team: string; action_type: string; champion_name: string | null }[];
  championNames: string[];
}) {
  const savedByTurn = new Map(actions.map((item) => [item.turn_number, item.champion_name ?? ""]));
  const suggestionId = `champion-suggestions-${planId}`;
  return (
    <form action={action} className="mt-3 space-y-3 rounded-lg bg-slate-950/70 p-3">
      <input type="hidden" name="plan_id" value={planId} />
      <datalist id={suggestionId}>
        {championNames.map((champion) => <option key={champion} value={champion} />)}
      </datalist>
      <p className="text-[10px] leading-4 text-slate-500">Enter champions in turn order. Saved champion pools appear as suggestions, and you can type any champion.</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {draftSequence.map((turn, index) => {
          const turnNumber = index + 1;
          const blue = turn.team === "blue";
          return (
            <label key={turnNumber} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${blue ? "border-sky-400/15 bg-sky-400/[0.04]" : "border-rose-400/15 bg-rose-400/[0.04]"}`}>
              <span className="w-5 text-[10px] text-slate-500">{turnNumber}</span>
              <span className={`w-14 text-[10px] font-semibold ${blue ? "text-sky-300" : "text-rose-300"}`}>{blue ? "Blue" : "Red"}</span>
              <span className="w-7 text-[10px] capitalize text-slate-500">{turn.action}</span>
              <input
                name={`turn_${turnNumber}`}
                maxLength={40}
                list={suggestionId}
                defaultValue={savedByTurn.get(turnNumber) ?? ""}
                placeholder={`${turn.action} champion`}
                className="min-w-0 flex-1 rounded border border-white/10 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-emerald-400"
              />
            </label>
          );
        })}
      </div>
      <button className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950">Save pick and ban board</button>
    </form>
  );
}

function DraftPlanForm({
  action,
  buttonText,
  plan,
}: {
  action: (formData: FormData) => Promise<void>;
  buttonText: string;
  plan?: {
    id: string;
    plan_name: string;
    opponent_name: string;
    patch: string;
    team_side: string;
    priority_picks: string[];
    priority_bans: string[];
    notes: string | null;
  };
}) {
  return (
    <form action={action} className="absolute right-0 top-9 z-40 w-80 max-w-[90vw] space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl">
      {plan ? <input type="hidden" name="plan_id" value={plan.id} /> : null}
      <h3 className="font-semibold">{plan ? "Edit draft plan" : "New draft plan"}</h3>
      <label className="block text-sm text-slate-300">Plan name
        <input name="plan_name" required maxLength={80} defaultValue={plan?.plan_name ?? ""} placeholder="e.g. Playoffs game 1" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm text-slate-300">Opponent
        <input name="opponent_name" required maxLength={100} defaultValue={plan?.opponent_name ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-slate-300">Patch
          <input name="patch" maxLength={20} defaultValue={plan?.patch ?? ""} placeholder="e.g. 14.20" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm text-slate-300">Our side
          <select name="team_side" defaultValue={plan?.team_side ?? "blue"} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
            <option value="blue">Blue</option><option value="red">Red</option>
          </select>
        </label>
      </div>
      <label className="block text-sm text-slate-300">Priority picks (up to 5)
        <input name="priority_picks" maxLength={250} defaultValue={plan?.priority_picks.join(", ") ?? ""} placeholder="Ahri, Jarvan IV, ..." className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <span className="mt-1 block text-[10px] text-slate-500">Separate champion names with commas.</span>
      </label>
      <label className="block text-sm text-slate-300">Priority bans (up to 5)
        <input name="priority_bans" maxLength={250} defaultValue={plan?.priority_bans.join(", ") ?? ""} placeholder="Yone, Skarner, ..." className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <span className="mt-1 block text-[10px] text-slate-500">Separate champion names with commas.</span>
      </label>
      <label className="block text-sm text-slate-300">Scout / draft notes
        <textarea name="notes" maxLength={1000} rows={3} defaultValue={plan?.notes ?? ""} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <button className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">{buttonText}</button>
    </form>
  );
}

const reviewCategories = ["mistake", "strength", "objective", "draft", "communication", "other"] as const;

function ReviewNoteForm({
  action,
  sessions,
  roster,
  note,
  buttonText,
}: {
  action: (formData: FormData) => Promise<void>;
  sessions: { id: string; opponent_name: string; scheduled_for: string }[];
  roster: { id: string; player_name: string; role: string }[];
  note?: {
    id: string;
    scrim_id: string;
    roster_member_id: string | null;
    video_timestamp_seconds: number;
    category: string;
    note: string;
    action_item: string | null;
    status: string;
  };
  buttonText: string;
}) {
  return (
    <form action={action} className="absolute right-0 top-9 z-40 w-80 max-w-[90vw] space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl">
      {note ? <input type="hidden" name="review_note_id" value={note.id} /> : null}
      <h3 className="font-semibold">{note ? "Edit review note" : "Add VOD note"}</h3>
      <label className="block text-sm text-slate-300">Review session
        <select name="scrim_id" required defaultValue={note?.scrim_id ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          {sessions.map((session) => <option key={session.id} value={session.id}>{session.opponent_name} · {formatLondonDate(session.scheduled_for)}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-slate-300">Video time (MM:SS)
          <input name="video_timestamp" required pattern="[0-9]{1,3}:[0-5][0-9]" maxLength={6} defaultValue={note ? formatVideoTimestamp(note.video_timestamp_seconds) : ""} placeholder="12:34" className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm text-slate-300">Category
          <select name="category" defaultValue={note?.category ?? "mistake"} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
            {reviewCategories.map((category) => <option key={category} value={category}>{capitalize(category)}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm text-slate-300">Player (optional)
        <select name="roster_member_id" defaultValue={note?.roster_member_id ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          <option value="">Team note / no specific player</option>
          {roster.map((member) => <option key={member.id} value={member.id}>{member.player_name} · {member.role === "bottom" ? "Adc" : capitalize(member.role)}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-300">What happened?
        <textarea name="note" required maxLength={1000} rows={3} defaultValue={note?.note ?? ""} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm text-slate-300">Follow-up action (optional)
        <textarea name="action_item" maxLength={500} rows={2} defaultValue={note?.action_item ?? ""} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      {note ? <label className="block text-sm text-slate-300">Status
        <select name="status" defaultValue={note.status} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          <option value="open">Open</option><option value="done">Done</option>
        </select>
      </label> : null}
      <button className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">{buttonText}</button>
    </form>
  );
}

function PlayerStatsForm({
  action,
  buttonText,
  matchId,
  roster,
  stat,
}: {
  action: (formData: FormData) => Promise<void>;
  buttonText: string;
  matchId: string;
  roster: { id: string; player_name: string; role: string }[];
  stat?: { id: string; roster_member_id: string; kills: number; deaths: number; assists: number; cs: number; vision_score: number; notes: string | null };
}) {
  return (
    <form action={action} className="absolute right-0 top-9 z-30 w-80 max-w-[90vw] space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl">
      <input type="hidden" name="match_id" value={matchId} />
      {stat ? <input type="hidden" name="stat_id" value={stat.id} /> : null}
      <h3 className="font-semibold">{stat ? "Edit player stats" : "Record player stats"}</h3>
      <label className="block text-sm text-slate-300">Player
        <select name="roster_member_id" required defaultValue={stat?.roster_member_id ?? ""} disabled={Boolean(stat)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm disabled:opacity-70">
          {!stat ? <option value="" disabled>Select a player</option> : null}
          {roster.map((member) => <option key={member.id} value={member.id}>{member.player_name} · {member.role === "bottom" ? "Adc" : capitalize(member.role)}</option>)}
        </select>
        {stat ? <input type="hidden" name="roster_member_id" value={stat.roster_member_id} /> : null}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {(["kills", "deaths", "assists"] as const).map((field) => <label key={field} className="block text-xs text-slate-400">{capitalize(field)}<input name={field} type="number" min="0" max="9999" required defaultValue={stat?.[field] ?? 0} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-sm text-slate-100" /></label>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-400">CS<input name="cs" type="number" min="0" max="9999" required defaultValue={stat?.cs ?? 0} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-sm text-slate-100" /></label>
        <label className="block text-xs text-slate-400">Vision score<input name="vision_score" type="number" min="0" max="9999" required defaultValue={stat?.vision_score ?? 0} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-sm text-slate-100" /></label>
      </div>
      <label className="block text-sm text-slate-300">Notes (optional)
        <textarea name="notes" maxLength={500} rows={2} defaultValue={stat?.notes ?? ""} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <p className="text-[10px] leading-4 text-slate-500">Enter series totals for this player in this match result.</p>
      <button className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">{buttonText}</button>
    </form>
  );
}

function MatchForm({
  action,
  buttonText,
  match,
  draftPlans,
}: {
  action: (formData: FormData) => Promise<void>;
  buttonText: string;
  match?: {
    id: string;
    opponent_name: string;
    played_on: string;
    our_score: number;
    opponent_score: number;
    notes: string | null;
    draft_plan_id: string | null;
  };
  draftPlans: { id: string; plan_name: string; opponent_name: string; patch: string; team_side: string; priority_picks: string[]; priority_bans: string[]; notes: string | null }[];
}) {
  return (
    <form action={action} className="absolute right-0 top-9 z-20 w-80 max-w-[90vw] space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl">
      {match && <input type="hidden" name="match_id" value={match.id} />}
      <h3 className="font-semibold">{match ? "Edit result" : "Add match result"}</h3>
      <label className="block text-sm text-slate-300">Opponent
        <input name="opponent_name" required maxLength={100} defaultValue={match?.opponent_name ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm text-slate-300">Match date
        <input name="played_on" type="date" required defaultValue={match?.played_on ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <label className="block text-sm text-slate-300">Draft plan (optional)
        <select name="draft_plan_id" defaultValue={match?.draft_plan_id ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm">
          <option value="">No linked draft</option>
          {draftPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.plan_name} · vs {plan.opponent_name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-slate-300">Our score
          <input name="our_score" type="number" min="0" max="99" required defaultValue={match?.our_score ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm text-slate-300">Their score
          <input name="opponent_score" type="number" min="0" max="99" required defaultValue={match?.opponent_score ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        </label>
      </div>
      <label className="block text-sm text-slate-300">Notes (optional)
        <textarea name="notes" maxLength={1000} rows={2} defaultValue={match?.notes ?? ""} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
      </label>
      <button className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950">{buttonText}</button>
    </form>
  );
}
async function addScrim(formData: FormData) {
  "use server";
  const opponentName = String(formData.get("opponent_name") ?? "").trim();
  const dateTime = String(formData.get("scheduled_for") ?? "");
  const sessionType = formData.get("session_type") === "vod_review" ? "vod_review" : "scrim";
  const status = formData.get("status") === "confirmed" ? "confirmed" : "planned";
  const notes = String(formData.get("notes") ?? "").trim();
  if (!opponentName || !dateTime) redirect("/?notice=error");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("scrims").insert({
    opponent_name: opponentName,
    scheduled_for: londonDateTimeToIso(dateTime),
    session_type: sessionType,
    status,
    notes: notes || null,
  });
  if (error) {
    console.error("Could not add scrim:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=session_added");
}
async function updateScrim(formData: FormData) {
  "use server";
  const id = String(formData.get("scrim_id") ?? "");
  const opponentName = String(formData.get("opponent_name") ?? "").trim();
  const dateTime = String(formData.get("scheduled_for") ?? "");
  const sessionType = formData.get("session_type") === "vod_review" ? "vod_review" : "scrim";
  const status = formData.get("status") === "confirmed" ? "confirmed" : "planned";
  const notes = String(formData.get("notes") ?? "").trim();
  if (!id || !opponentName || !dateTime) redirect("/?notice=error");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("scrims").update({
    opponent_name: opponentName,
    scheduled_for: londonDateTimeToIso(dateTime),
    session_type: sessionType,
    status,
    notes: notes || null,
  }).eq("id", id);
  if (error) {
    console.error("Could not update scrim:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=session_updated");
}
async function deleteScrim(formData: FormData) {
  "use server";
  const id = String(formData.get("scrim_id") ?? "");
  if (!id) redirect("/?notice=error");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("scrims").delete().eq("id", id);
  if (error) {
    console.error("Could not delete scrim:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=session_deleted");
}
async function addRosterMember(formData: FormData) {
  "use server";
  const playerName = String(formData.get("player_name") ?? "").trim();
  const role = String(formData.get("role") ?? "substitute");
  if (!playerName || !roles.includes(role)) redirect("/?notice=error");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("roster_members").insert({
    player_name: playerName,
    role,
  });
  if (error) {
    console.error("Could not add player:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=player_added");
}
async function updateRosterMember(formData: FormData) {
  "use server";
  const id = String(formData.get("member_id") ?? "");
  const playerName = String(formData.get("player_name") ?? "").trim();
  const role = String(formData.get("role") ?? "substitute");
  if (!id || !playerName || !roles.includes(role)) redirect("/?notice=error");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("roster_members")
    .update({ player_name: playerName, role })
    .eq("id", id);
  if (error) {
    console.error("Could not update player:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=player_updated");
}
async function deleteRosterMember(formData: FormData) {
  "use server";
  const id = String(formData.get("member_id") ?? "");
  if (!id) redirect("/?notice=error");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("roster_members").delete().eq("id", id);
  if (error) {
    console.error("Could not delete player:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=player_deleted");
}
async function addChampionPool(formData: FormData) {
  "use server";
  const rosterMemberId = String(formData.get("roster_member_id") ?? "");
  const championName = String(formData.get("champion_name") ?? "").trim();
  const comfort = Number(formData.get("comfort"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (!rosterMemberId || championName.length < 1 || championName.length > 40 || !Number.isInteger(comfort) || comfort < 1 || comfort > 5 || notes.length > 300) {
    redirect("/?notice=error#draft-prep");
  }

  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("champion_pools").insert({
    roster_member_id: rosterMemberId,
    champion_name: championName,
    comfort,
    notes: notes || null,
  });
  if (error) {
    console.error("Could not add champion to pool:", error);
    redirect("/?notice=error#draft-prep");
  }
  revalidatePath("/");
  redirect("/?notice=champion_added#draft-prep");
}

async function deleteChampionPool(formData: FormData) {
  "use server";
  const id = String(formData.get("pick_id") ?? "");
  if (!id) redirect("/?notice=error#draft-prep");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("champion_pools").delete().eq("id", id);
  if (error) {
    console.error("Could not remove champion from pool:", error);
    redirect("/?notice=error#draft-prep");
  }
  revalidatePath("/");
  redirect("/?notice=champion_deleted#draft-prep");
}

function parseChampionList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

async function saveDraftBoard(formData: FormData) {
  "use server";
  const planId = String(formData.get("plan_id") ?? "");
  if (!planId) redirect("/?notice=error#draft-prep");
  const championNames = draftSequence.map((_, index) => String(formData.get(`turn_${index + 1}`) ?? "").trim());
  if (championNames.some((name) => name.length > 40)) redirect("/?notice=error#draft-prep");
  const selectedNames = championNames.filter(Boolean).map((name) => name.toLowerCase());
  if (new Set(selectedNames).size !== selectedNames.length) redirect("/?notice=draft_invalid#draft-prep");

  const supabase = await requireSignedInSupabase();
  const rows = draftSequence.map((turn, index) => ({
    draft_plan_id: planId,
    turn_number: index + 1,
    team: turn.team,
    action_type: turn.action,
    champion_name: championNames[index] || null,
  }));
  const { error } = await supabase.from("draft_actions").upsert(rows, {
    onConflict: "draft_plan_id,turn_number",
  });
  if (error) {
    console.error("Could not save the draft board:", error);
    redirect("/?notice=error#draft-prep");
  }
  revalidatePath("/");
  redirect("/?notice=draft_board_saved#draft-prep");
}

async function saveDraftPlan(formData: FormData) {
  "use server";
  const id = String(formData.get("plan_id") ?? "");
  const planName = String(formData.get("plan_name") ?? "").trim();
  const opponentName = String(formData.get("opponent_name") ?? "").trim();
  const patch = String(formData.get("patch") ?? "").trim();
  const teamSide = formData.get("team_side") === "red" ? "red" : "blue";
  const priorityPicks = parseChampionList(formData.get("priority_picks"));
  const priorityBans = parseChampionList(formData.get("priority_bans"));
  const notes = String(formData.get("notes") ?? "").trim();
  const validChampionList = (list: string[]) =>
    list.length <= 5 &&
    list.every((champion) => champion.length <= 40) &&
    new Set(list.map((champion) => champion.toLowerCase())).size === list.length;
  if (!planName || planName.length > 80 || !opponentName || opponentName.length > 100 || patch.length > 20 || notes.length > 1000 || !validChampionList(priorityPicks) || !validChampionList(priorityBans)) {
    redirect("/?notice=error#draft-prep");
  }
  const supabase = await requireSignedInSupabase();
  const values = {
    plan_name: planName,
    opponent_name: opponentName,
    patch,
    team_side: teamSide,
    priority_picks: priorityPicks,
    priority_bans: priorityBans,
    notes: notes || null,
  };
  const { error } = id
    ? await supabase.from("draft_plans").update(values).eq("id", id)
    : await supabase.from("draft_plans").insert(values);
  if (error) {
    console.error("Could not save draft plan:", error);
    redirect("/?notice=error#draft-prep");
  }
  revalidatePath("/");
  redirect(id ? "/?notice=draft_updated#draft-prep" : "/?notice=draft_added#draft-prep");
}

async function deleteDraftPlan(formData: FormData) {
  "use server";
  const id = String(formData.get("plan_id") ?? "");
  if (!id) redirect("/?notice=error#draft-prep");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("draft_plans").delete().eq("id", id);
  if (error) {
    console.error("Could not delete draft plan:", error);
    redirect("/?notice=error#draft-prep");
  }
  revalidatePath("/");
  redirect("/?notice=draft_deleted#draft-prep");
}

function readReviewNote(formData: FormData) {
  const scrimId = String(formData.get("scrim_id") ?? "");
  const timestamp = String(formData.get("video_timestamp") ?? "").trim();
  const timestampMatch = /^(\d{1,3}):([0-5]\d)$/.exec(timestamp);
  const videoTimestampSeconds = timestampMatch
    ? Number(timestampMatch[1]) * 60 + Number(timestampMatch[2])
    : -1;
  const rosterMemberId = String(formData.get("roster_member_id") ?? "");
  const category = String(formData.get("category") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const actionItem = String(formData.get("action_item") ?? "").trim();
  const status = formData.get("status") === "done" ? "done" : "open";
  if (!scrimId || videoTimestampSeconds < 0 || videoTimestampSeconds > 36000 || !reviewCategories.includes(category as (typeof reviewCategories)[number]) || !note || note.length > 1000 || actionItem.length > 500) {
    redirect("/?notice=review_invalid#vod-review");
  }
  return {
    scrim_id: scrimId,
    roster_member_id: rosterMemberId || null,
    video_timestamp_seconds: videoTimestampSeconds,
    category,
    note,
    action_item: actionItem || null,
    status,
  };
}

async function addReviewNote(formData: FormData) {
  "use server";
  const values = readReviewNote(formData);
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("review_notes").insert(values);
  if (error) {
    console.error("Could not add VOD review note:", error);
    redirect("/?notice=error#vod-review");
  }
  revalidatePath("/");
  redirect("/?notice=review_note_added#vod-review");
}

async function updateReviewNote(formData: FormData) {
  "use server";
  const id = String(formData.get("review_note_id") ?? "");
  if (!id) redirect("/?notice=review_invalid#vod-review");
  const values = readReviewNote(formData);
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("review_notes").update(values).eq("id", id);
  if (error) {
    console.error("Could not update VOD review note:", error);
    redirect("/?notice=error#vod-review");
  }
  revalidatePath("/");
  redirect("/?notice=review_note_updated#vod-review");
}

async function deleteReviewNote(formData: FormData) {
  "use server";
  const id = String(formData.get("review_note_id") ?? "");
  if (!id) redirect("/?notice=review_invalid#vod-review");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("review_notes").delete().eq("id", id);
  if (error) {
    console.error("Could not delete VOD review note:", error);
    redirect("/?notice=error#vod-review");
  }
  revalidatePath("/");
  redirect("/?notice=review_note_deleted#vod-review");
}

function readPlayerStats(formData: FormData) {
  const matchId = String(formData.get("match_id") ?? "");
  const rosterMemberId = String(formData.get("roster_member_id") ?? "");
  const readCount = (name: string) => {
    const raw = String(formData.get(name) ?? "");
    return /^\d{1,4}$/.test(raw) ? Number(raw) : -1;
  };
  const kills = readCount("kills");
  const deaths = readCount("deaths");
  const assists = readCount("assists");
  const cs = readCount("cs");
  const visionScore = readCount("vision_score");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!matchId || !rosterMemberId || [kills, deaths, assists, cs, visionScore].some((value) => value < 0) || notes.length > 500) {
    redirect("/?notice=player_stats_invalid#matches");
  }
  return { matchId, rosterMemberId, values: { match_id: matchId, roster_member_id: rosterMemberId, kills, deaths, assists, cs, vision_score: visionScore, notes: notes || null } };
}

async function validateOwnedPlayerAndMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
  rosterMemberId: string,
) {
  const [{ data: match, error: matchError }, { data: player, error: playerError }] = await Promise.all([
    supabase.from("matches").select("id").eq("id", matchId).maybeSingle(),
    supabase.from("roster_members").select("id").eq("id", rosterMemberId).maybeSingle(),
  ]);
  if (matchError || playerError || !match || !player) redirect("/?notice=player_stats_invalid#matches");
}

async function addPlayerStats(formData: FormData) {
  "use server";
  const { matchId, rosterMemberId, values } = readPlayerStats(formData);
  const supabase = await requireSignedInSupabase();
  await validateOwnedPlayerAndMatch(supabase, matchId, rosterMemberId);
  const { data: existing, error: existingError } = await supabase.from("match_player_stats").select("id").eq("match_id", matchId).eq("roster_member_id", rosterMemberId).maybeSingle();
  if (existingError) {
    console.error("Could not check existing player stats:", existingError);
    redirect("/?notice=error#matches");
  }
  if (existing) redirect("/?notice=player_stats_duplicate#matches");
  const { error } = await supabase.from("match_player_stats").insert(values);
  if (error) {
    console.error("Could not save player stats:", error);
    redirect("/?notice=error#matches");
  }
  revalidatePath("/");
  redirect("/?notice=player_stats_added#matches");
}

async function updatePlayerStats(formData: FormData) {
  "use server";
  const id = String(formData.get("stat_id") ?? "");
  const { matchId, rosterMemberId, values } = readPlayerStats(formData);
  if (!id) redirect("/?notice=player_stats_invalid#matches");
  const supabase = await requireSignedInSupabase();
  await validateOwnedPlayerAndMatch(supabase, matchId, rosterMemberId);
  const { error } = await supabase.from("match_player_stats").update(values).eq("id", id);
  if (error) {
    console.error("Could not update player stats:", error);
    redirect("/?notice=error#matches");
  }
  revalidatePath("/");
  redirect("/?notice=player_stats_updated#matches");
}

async function deletePlayerStats(formData: FormData) {
  "use server";
  const id = String(formData.get("stat_id") ?? "");
  if (!id) redirect("/?notice=player_stats_invalid#matches");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("match_player_stats").delete().eq("id", id);
  if (error) {
    console.error("Could not delete player stats:", error);
    redirect("/?notice=error#matches");
  }
  revalidatePath("/");
  redirect("/?notice=player_stats_deleted#matches");
}

async function addMatch(formData: FormData) {
  "use server";
  const opponentName = String(formData.get("opponent_name") ?? "").trim();
  const playedOn = String(formData.get("played_on") ?? "");
  const ourScore = Number(formData.get("our_score"));
  const opponentScore = Number(formData.get("opponent_score"));
  const notes = String(formData.get("notes") ?? "").trim();
  const selectedDraftPlan = String(formData.get("draft_plan_id") ?? "");
  if (!validMatch(opponentName, playedOn, ourScore, opponentScore)) {
    redirect("/?notice=error");
  }
  const supabase = await requireSignedInSupabase();
  const draftPlanId = await validateOwnedDraftPlan(supabase, selectedDraftPlan);
  const { error } = await supabase.from("matches").insert({
    opponent_name: opponentName,
    played_on: playedOn,
    our_score: ourScore,
    opponent_score: opponentScore,
    notes: notes || null,
    draft_plan_id: draftPlanId,
  });
  if (error) {
    console.error("Could not add match:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=match_added");
}
async function updateMatch(formData: FormData) {
  "use server";
  const id = String(formData.get("match_id") ?? "");
  const opponentName = String(formData.get("opponent_name") ?? "").trim();
  const playedOn = String(formData.get("played_on") ?? "");
  const ourScore = Number(formData.get("our_score"));
  const opponentScore = Number(formData.get("opponent_score"));
  const notes = String(formData.get("notes") ?? "").trim();
  const selectedDraftPlan = String(formData.get("draft_plan_id") ?? "");
  if (!id || !validMatch(opponentName, playedOn, ourScore, opponentScore)) {
    redirect("/?notice=error");
  }
  const supabase = await requireSignedInSupabase();
  const draftPlanId = await validateOwnedDraftPlan(supabase, selectedDraftPlan);
  const { error } = await supabase.from("matches").update({
    opponent_name: opponentName,
    played_on: playedOn,
    our_score: ourScore,
    opponent_score: opponentScore,
    notes: notes || null,
    draft_plan_id: draftPlanId,
  }).eq("id", id);
  if (error) {
    console.error("Could not update match:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=match_updated");
}
async function deleteMatch(formData: FormData) {
  "use server";
  const id = String(formData.get("match_id") ?? "");
  if (!id) redirect("/?notice=error");
  const supabase = await requireSignedInSupabase();
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) {
    console.error("Could not delete match:", error);
    redirect("/?notice=error");
  }
  revalidatePath("/");
  redirect("/?notice=match_deleted");
}
function validMatch(name: string, date: string, our: number, opponent: number) {
  return (
    name.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isInteger(our) &&
    Number.isInteger(opponent) &&
    our >= 0 &&
    opponent >= 0 &&
    our <= 99 &&
    opponent <= 99
  );
}
async function validateOwnedDraftPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  if (!id) return null;
  const { data, error } = await supabase
    .from("draft_plans")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) redirect("/?notice=match_invalid_draft#matches");
  return data.id;
}

async function requireSignedInSupabase() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/auth/login");
  return supabase;
}
function londonDateTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Please enter a valid date and time.");
  const [, year, month, day, hour, minute] = match;
  const approximateUtc = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  );
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  });
  const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const offsetText = get(formatter.formatToParts(approximateUtc), "timeZoneName");
  const offsetMatch = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(offsetText);
  if (!offsetMatch) throw new Error("Could not determine the UK time-zone offset.");
  const sign = offsetMatch[1] === "-" ? -1 : 1;
  const offset = sign * (Number(offsetMatch[2] ?? 0) * 60 + Number(offsetMatch[3] ?? 0));
  const utcDate = new Date(approximateUtc.getTime() - offset * 60_000);
  const parts = formatter.formatToParts(utcDate);
  if (
    get(parts, "year") !== year ||
    get(parts, "month") !== month ||
    get(parts, "day") !== day ||
    get(parts, "hour") !== hour ||
    get(parts, "minute") !== minute
  ) {
    throw new Error("That UK local time is invalid because the clocks change then.");
  }
  return utcDate.toISOString();
}
function londonDateTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function formatLondonDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function formatLondonTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatVideoTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatDateOnly(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
function buildWeeklyActivity(matches: { played_on: string }[]) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`);
  const weekdayFromMonday = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - weekdayFromMonday);
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = labels.map((label, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    const isoDate = date.toISOString().slice(0, 10);
    return {
      label,
      date: isoDate,
      count: matches.filter((match) => match.played_on === isoDate).length,
      height: 8,
    };
  });
  const largest = Math.max(1, ...days.map((day) => day.count));
  return days.map((day) => ({
    ...day,
    height: day.count === 0 ? 8 : Math.max(18, Math.round((day.count / largest) * 100)),
  }));
}
function PlayerTrendCard({
  playerName,
  role,
  history,
}: {
  playerName: string;
  role: string;
  history: { opponent: string; playedOn: string; kda: number }[];
}) {
  const maxKda = Math.max(1, ...history.map((item) => item.kda));
  const points = history.map((item, index) => {
    const x = history.length === 1 ? 140 : 10 + (index / (history.length - 1)) * 260;
    const y = 62 - (item.kda / maxKda) * 48;
    return { ...item, x, y };
  });
  const first = history[0]?.kda ?? 0;
  const latest = history[history.length - 1]?.kda ?? 0;
  const change = latest - first;
  const trendTone = change >= 0 ? "text-emerald-300" : "text-rose-300";
  return (
    <article className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{playerName}</p>
          <p className="mt-1 text-[10px] text-slate-500">{role === "bottom" ? "Adc" : capitalize(role)} · {history.length} {history.length === 1 ? "match" : "matches"}</p>
        </div>
        <p className={`shrink-0 text-xs font-semibold ${trendTone}`}>Latest {latest.toFixed(2)} KDA</p>
      </div>
      <svg viewBox="0 0 280 72" role="img" aria-label={`${playerName} KDA over the latest ${history.length} matches`} className="mt-3 h-20 w-full overflow-visible">
        <line x1="8" y1="64" x2="272" y2="64" stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
        {points.length > 1 ? <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((point, index) => <circle key={`${point.playedOn}-${index}`} cx={point.x} cy={point.y} r="4" fill="#34d399" stroke="#020617" strokeWidth="2" />)}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>{history[0] ? formatDateOnly(history[0].playedOn) : "No matches"}</span>
        {history.length > 1 ? <span className={trendTone}>{change > 0 ? "+" : ""}{change.toFixed(2)} since first shown</span> : <span>Log another match to see a trend</span>}
        <span>{history.length ? formatDateOnly(history[history.length - 1].playedOn) : ""}</span>
      </div>
    </article>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

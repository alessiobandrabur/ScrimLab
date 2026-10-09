import { createClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import Link from "next/link";
import { Suspense } from "react";

const navigation = [
  { label: "Overview", href: "#overview", icon: "◈" },
  { label: "Roster", href: "#roster", icon: "◎" },
  { label: "Schedule", href: "#schedule", icon: "◷" },
  { label: "Draft prep", href: "#draft-prep", icon: "◇" },
  { label: "Matches", href: "#matches", icon: "⌁" },
  { label: "Analytics", href: "#analytics", icon: "▥" },
];

const results = [
  { opponent: "Apex Nova", score: "2 – 1", result: "W", tone: "text-emerald-400" },
  { opponent: "Redline Gaming", score: "0 – 2", result: "L", tone: "text-rose-400" },
  { opponent: "Northstar Academy", score: "2 – 0", result: "W", tone: "text-emerald-400" },
];

const performance = [
  { day: "M", value: 58 },
  { day: "T", value: 78 },
  { day: "W", value: 48 },
  { day: "T", value: 88 },
  { day: "F", value: 68 },
  { day: "S", value: 94 },
  { day: "S", value: 72 },
];

export default function Home() {
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
              Team workspace <span className="mx-2 text-slate-700">/</span>{" "}
              <span className="text-slate-200">Overview</span>
            </p>

            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:block">
                BETA WORKSPACE
              </span>
              <Suspense fallback={<span className="text-sm text-slate-500">Loading…</span>}>
                <AuthButton />
              </Suspense>
            </div>
          </header>

          <div id="overview" className="mx-auto max-w-7xl space-y-8 p-5 sm:p-8">
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

              <button
                type="button"
                className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                + Add a scrim
              </button>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Scrims this week" value="6" detail="2 scheduled today" />
              <MetricCard label="Win rate" value="67%" detail="Last 15 recorded games" />
              <MetricCard label="Roster" value="5 / 5" detail="Starting lineup complete" />
              <MetricCard label="Review queue" value="3" detail="Matches waiting for review" />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
              <div id="schedule" className="rounded-2xl border border-white/10 bg-slate-900/60">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="font-semibold">Today’s schedule</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Your upcoming team sessions
                    </p>
                  </div>
                  <a href="#schedule" className="text-sm text-emerald-300 hover:text-emerald-200">
                    View schedule →
                  </a>
                </div>

                <Suspense
                  fallback={
                    <p className="px-5 py-4 text-sm text-slate-500">
                      Loading schedule…
                    </p>
                  }
                >
                  <ScrimSchedule />
                </Suspense>
              </div>

              <div id="analytics" className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold">Team activity</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Sessions completed this week
                    </p>
                  </div>
                  <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">
                    +12%
                  </span>
                </div>

                <div className="mt-8 flex h-36 items-end justify-between gap-3">
                  {performance.map((bar, index) => (
                    <div
                      key={`${bar.day}-${index}`}
                      className="flex h-full flex-1 flex-col justify-end"
                    >
                      <div
                        className={`w-full rounded-t-md ${
                          index === 5 ? "bg-emerald-300" : "bg-emerald-400/35"
                        }`}
                        style={{ height: `${bar.value}%` }}
                      />
                      <span className="mt-2 text-center text-xs text-slate-500">
                        {bar.day}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
              <div id="roster" className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Active roster</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      League of Legends · Main team
                    </p>
                  </div>
                  <a href="#roster" className="text-sm text-emerald-300">
                    Manage →
                  </a>
                </div>

                <div className="mt-5 flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-400/10 font-bold text-indigo-300">
                    NOVA
                  </div>
                  <div>
                    <p className="font-semibold">Your team</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Add players to complete your roster
                    </p>
                  </div>
                </div>

                <div id="draft-prep" className="mt-4 rounded-xl border border-dashed border-white/15 p-4">
                  <p className="text-sm font-medium">Draft prep</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Your champion plans and draft notes will live here.
                  </p>
                </div>
              </div>

              <div id="matches" className="rounded-2xl border border-white/10 bg-slate-900/60">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div>
                    <h2 className="font-semibold">Recent results</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Latest recorded matches
                    </p>
                  </div>
                  <a href="#matches" className="text-sm text-emerald-300">
                    All matches →
                  </a>
                </div>

                <div className="divide-y divide-white/5">
                  {results.map((match) => (
                    <div key={match.opponent} className="flex items-center gap-4 px-5 py-4">
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-sm font-bold ${match.tone}`}
                      >
                        {match.result}
                      </span>
                      <p className="flex-1 text-sm font-medium">{match.opponent}</p>
                      <span className="text-sm font-semibold text-slate-300">
                        {match.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <p className="pb-4 text-center text-xs text-slate-600">
              ScrimLab · Built for teams that prepare to win.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

async function ScrimSchedule() {
  const supabase = await createClient();

  const { data: scrims, error } = await supabase
    .from("scrims")
    .select("id, opponent_name, scheduled_for, session_type, status")
    .order("scheduled_for", { ascending: true })
    .limit(3);

  if (error) {
    console.error("Could not load scrims:", error);
    return (
      <p className="px-5 py-4 text-sm text-rose-400">
        Could not load the schedule. Check the VS Code terminal.
      </p>
    );
  }

  if (!scrims || scrims.length === 0) {
    return (
      <p className="px-5 py-4 text-sm text-slate-500">
        No scrims yet. We’ll add your first one next.
      </p>
    );
  }

  return (
    <div className="divide-y divide-white/5">
      {scrims.map((scrim) => (
        <div key={scrim.id} className="flex items-center gap-4 px-5 py-4">
          <span className="w-12 text-sm font-semibold text-slate-300">
            {new Date(scrim.scheduled_for).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="h-9 w-px bg-white/10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{scrim.opponent_name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {scrim.session_type === "vod_review" ? "VOD review" : "Scrim block"}
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-400">
            {scrim.status}
          </span>
        </div>
      ))}
    </div>
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
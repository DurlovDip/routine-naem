import { useState } from "react";
import { AlertCircle, Check, Cloud, CloudOff, Copy, RefreshCw } from "lucide-react";
import { isSupabaseConfigured } from "../lib/supabase";
import { useSchedule } from "../state";
import { Button } from "./ui";

const SCHEMA_SQL = `-- Run this in Supabase SQL Editor:
create table if not exists public.schedules (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.schedules enable row level security;

create policy "Allow public read schedules"
  on public.schedules for select using (true);

create policy "Allow public insert schedules"
  on public.schedules for insert with check (true);

create policy "Allow public update schedules"
  on public.schedules for update using (true) with check (true);

alter publication supabase_realtime add table public.schedules;`;

export function SyncStatusButton() {
  const { syncStatus, lastSyncedAt, refreshFromCloud } = useSchedule();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copySql() {
    void navigator.clipboard.writeText(SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        className={`sync-btn sync-${syncStatus}`}
        onClick={() => setOpen(true)}
        title="Supabase sync status"
        aria-label="Supabase sync status"
      >
        {syncStatus === "connected" && <Cloud size={15} className="text-emerald-600" />}
        {syncStatus === "saving" && <RefreshCw size={14} className="animate-spin text-amber-600" />}
        {syncStatus === "offline" && <CloudOff size={15} className="text-stone-500" />}
        {syncStatus === "error" && <AlertCircle size={15} className="text-rose-600" />}
        {syncStatus === "unconfigured" && <Cloud size={15} className="text-stone-400" />}

        <span className="sync-btn-label">
          {syncStatus === "connected" && "Cloud Synced"}
          {syncStatus === "saving" && "Saving..."}
          {syncStatus === "offline" && "Offline"}
          {syncStatus === "error" && "Sync Error"}
          {syncStatus === "unconfigured" && "Connect Supabase"}
        </span>
      </button>

      {open ? (
        <div className="modal-back" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="modal max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supabase-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="supabase-title" className="text-lg font-bold flex items-center gap-2">
                <Cloud size={20} className={isSupabaseConfigured ? "text-emerald-600" : "text-stone-500"} />
                Supabase Cloud Storage
              </h2>
              <button
                type="button"
                className="text-stone-400 hover:text-stone-600 text-lg leading-none"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            {isSupabaseConfigured ? (
              <div className="space-y-3 text-sm text-stone-700">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2.5">
                  <Check size={18} className="text-emerald-700 mt-0.5 shrink-0" />
                  <div>
                    <strong className="block text-emerald-900 font-semibold">
                      Connected to Supabase
                    </strong>
                    <span className="text-xs text-emerald-800">
                      All changes are automatically synced to your database and backed up to local storage.
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-stone-600 border-t border-stone-200 pt-2">
                  <span>
                    Last synced:{" "}
                    <strong>
                      {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : "Just now"}
                    </strong>
                  </span>
                  <Button
                    tone="ghost"
                    className="text-xs py-1"
                    onClick={() => void refreshFromCloud()}
                  >
                    <RefreshCw size={12} /> Sync Now
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-stone-700">
                <p>
                  Connect your routine to a free <strong>Supabase</strong> PostgreSQL database so your schedule is saved in the cloud and synced across devices.
                </p>

                <div className="rounded-md border border-stone-200 bg-stone-50 p-2.5 text-xs space-y-2">
                  <div className="font-semibold text-stone-800">Step 1: Create the table in Supabase</div>
                  <p className="text-stone-600">
                    Go to your Supabase project's <strong>SQL Editor</strong>, paste this query and run it:
                  </p>
                  <div className="relative">
                    <pre className="p-2 bg-stone-900 text-stone-100 rounded text-[11px] overflow-x-auto max-h-36">
                      {SCHEMA_SQL}
                    </pre>
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 px-2 py-1 rounded bg-stone-700 hover:bg-stone-600 text-white text-[11px] flex items-center gap-1"
                      onClick={copySql}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? "Copied" : "Copy SQL"}
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-stone-200 bg-stone-50 p-2.5 text-xs space-y-2">
                  <div className="font-semibold text-stone-800">Step 2: Add credentials to <code>.env.local</code></div>
                  <p className="text-stone-600">
                    In your project root, open <code>.env.local</code> and fill in your Project URL and Anon Key (from Project Settings &gt; API):
                  </p>
                  <pre className="p-2 bg-stone-900 text-stone-100 rounded text-[11px] overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
                  </pre>
                  <p className="text-[11px] text-stone-500">
                    Then restart the dev server (<code>npm run dev</code>) to connect!
                  </p>
                </div>

                <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                  Until Supabase is configured, your routine continues to be safely saved in your browser's local storage.
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

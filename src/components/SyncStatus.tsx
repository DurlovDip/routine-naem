import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Cloud,
  CloudOff,
  Copy,
  HardDrive,
  History,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  type BackupEntry,
  type BackupType,
  fetchBackups,
  isSupabaseConfigured,
  restoreRecordFromBackup,
} from "../lib/supabase";
import { useSchedule } from "../state";
import { Button } from "./ui";

const SCHEMA_SQL = `-- Run this in Supabase SQL Editor:
-- 1. Teachers Table
create table if not exists public.teachers (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.teachers enable row level security;
drop policy if exists "Allow public all teachers" on public.teachers;
create policy "Allow public all teachers" on public.teachers for all using (true) with check (true);

-- 2. Modules Table
drop table if exists public.modules cascade;
create table public.modules (
  id integer primary key,
  module_number text not null,
  module_subnumber text not null default '',
  module_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.modules enable row level security;
drop policy if exists "Allow public all modules" on public.modules;
create policy "Allow public all modules" on public.modules for all using (true) with check (true);

-- 3. Batches Table
drop table if exists public.batches cascade;
create table public.batches (
  id integer primary key,
  name text not null default '',
  number_of_students integer not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.batches enable row level security;
drop policy if exists "Allow public all batches" on public.batches;
create policy "Allow public all batches" on public.batches for all using (true) with check (true);

-- 4. Schedules Table
create table if not exists public.schedules (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.schedules enable row level security;
drop policy if exists "Allow public all schedules" on public.schedules;
create policy "Allow public all schedules" on public.schedules for all using (true) with check (true);

-- 5. Realtime Publication
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'teachers') then
    alter publication supabase_realtime add table public.teachers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'modules') then
    alter publication supabase_realtime add table public.modules;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'batches') then
    alter publication supabase_realtime add table public.batches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'schedules') then
    alter publication supabase_realtime add table public.schedules;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'backups') then
    alter publication supabase_realtime add table public.backups;
  end if;
end $$;

-- 6. RAID-Style Immutable Backup Schema & Triggers
create schema if not exists backup;

create table if not exists backup.records (
  id bigserial primary key,
  type text not null check (type in ('teachers', 'batches', 'modules', 'schedules')),
  record_id text,
  data jsonb not null,
  operation text not null default 'SNAPSHOT',
  created_at timestamptz not null default now()
);

create table if not exists public.backups (
  id bigserial primary key,
  type text not null check (type in ('teachers', 'batches', 'modules', 'schedules')),
  record_id text,
  data jsonb not null,
  operation text not null default 'SNAPSHOT',
  created_at timestamptz not null default now()
);

alter table backup.records enable row level security;
alter table public.backups enable row level security;
drop policy if exists "Allow public read backups" on public.backups;
create policy "Allow public read backups" on public.backups for select using (true);
drop policy if exists "Allow public insert backups" on public.backups;
create policy "Allow public insert backups" on public.backups for insert with check (true);
-- NO UPDATE or DELETE policies: Cannot be deleted without direct database access!

create or replace function public.backup_record_trigger()
returns trigger language plpgsql security definer as $$
declare
  rec_type text;
  rec_id text;
  rec_data jsonb;
begin
  rec_type := TG_TABLE_NAME;
  if (TG_OP = 'DELETE') then
    rec_id := coalesce(OLD.id::text, '');
    rec_data := to_jsonb(OLD);
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, 'DELETE', now());
    return OLD;
  else
    rec_id := coalesce(NEW.id::text, '');
    rec_data := to_jsonb(NEW);
    insert into backup.records (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    insert into public.backups (type, record_id, data, operation, created_at)
    values (rec_type, rec_id, rec_data, TG_OP, now());
    return NEW;
  end if;
end;
$$;

drop trigger if exists trg_backup_teachers on public.teachers;
create trigger trg_backup_teachers after insert or update or delete on public.teachers
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_modules on public.modules;
create trigger trg_backup_modules after insert or update or delete on public.modules
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_batches on public.batches;
create trigger trg_backup_batches after insert or update or delete on public.batches
  for each row execute function public.backup_record_trigger();

drop trigger if exists trg_backup_schedules on public.schedules;
create trigger trg_backup_schedules after insert or update or delete on public.schedules
  for each row execute function public.backup_record_trigger();
`;

export function SyncStatusButton() {
  const { syncStatus, lastSyncedAt, refreshFromCloud } = useSchedule();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"status" | "backups">("status");
  const [copied, setCopied] = useState(false);

  // Backup state
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backupTypeFilter, setBackupTypeFilter] = useState<BackupType | "all">("all");
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  function copySql() {
    void navigator.clipboard.writeText(SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function loadBackups(type: BackupType | "all") {
    if (!isSupabaseConfigured) return;
    setLoadingBackups(true);
    try {
      const list = await fetchBackups(type === "all" ? undefined : type, 40);
      setBackups(list);
    } finally {
      setLoadingBackups(false);
    }
  }

  useEffect(() => {
    if (open && activeTab === "backups") {
      void loadBackups(backupTypeFilter);
    }
  }, [open, activeTab, backupTypeFilter]);

  async function handleRestore(entry: BackupEntry) {
    if (
      !confirm(
        `Restore this ${entry.type.slice(0, -1)} (${entry.operation} from ${new Date(
          entry.created_at,
        ).toLocaleTimeString()})? It will recover this record to the active schedule.`,
      )
    ) {
      return;
    }

    setRestoringId(entry.id);
    setRestoreFeedback(null);
    try {
      const res = await restoreRecordFromBackup(entry);
      if (res.success) {
        setRestoreFeedback(`✓ ${res.message}`);
        await refreshFromCloud();
        await loadBackups(backupTypeFilter);
      } else {
        setRestoreFeedback(`✗ ${res.message}`);
      }
    } finally {
      setRestoringId(null);
    }
  }

  function renderBackupPreview(entry: BackupEntry) {
    const d = entry.data;
    if (entry.type === "teachers") {
      return (
        <span className="font-mono text-xs">
          <strong>{String(d.name || "(Unnamed)")}</strong> ({String(d.id || entry.record_id)})
        </span>
      );
    }
    if (entry.type === "modules") {
      const mNum = d.module_number ? `M-${d.module_number}` : "";
      const sNum = d.module_subnumber ? `.${d.module_subnumber}` : "";
      const code = `${mNum}${sNum}`.trim();
      return (
        <span className="font-mono text-xs">
          <strong>#{String(entry.record_id || d.id)}</strong> {code} {d.module_name ? `- "${d.module_name}"` : ""}
        </span>
      );
    }
    if (entry.type === "batches") {
      return (
        <span className="font-mono text-xs">
          <strong>Batch #{String(entry.record_id || d.id)}</strong>
          {d.name ? ` "${d.name}"` : ""} ({String(d.number_of_students ?? 40)} students)
        </span>
      );
    }
    return (
      <span className="font-mono text-xs text-stone-600">
        Schedule Document Snapshot
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`sync-btn sync-${syncStatus}`}
        onClick={() => setOpen(true)}
        title="Supabase sync & RAID backup status"
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
            className="modal max-w-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supabase-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Cloud
                  size={20}
                  className={isSupabaseConfigured ? "text-emerald-600" : "text-stone-500"}
                />
                <h2 id="supabase-title" className="text-lg font-bold">
                  Supabase Cloud & RAID Backups
                </h2>
              </div>
              <button
                type="button"
                className="text-stone-400 hover:text-stone-600 text-lg leading-none"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            {/* Tab navigation */}
            <div className="mb-4 flex items-center gap-2 border-b border-stone-100 pb-2">
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === "status"
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
                onClick={() => setActiveTab("status")}
              >
                <Cloud size={13} />
                Connection & SQL
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === "backups"
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
                onClick={() => setActiveTab("backups")}
              >
                <ShieldCheck size={13} className="text-emerald-500" />
                RAID Backups & Recovery
                {backups.length > 0 && (
                  <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] text-emerald-800">
                    {backups.length}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: Status & SQL */}
            {activeTab === "status" && (
              <>
                {isSupabaseConfigured ? (
                  <div className="space-y-3 text-sm text-stone-700">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2.5">
                      <Check size={18} className="text-emerald-700 mt-0.5 shrink-0" />
                      <div>
                        <strong className="block text-emerald-900 font-semibold">
                          Connected to Supabase
                        </strong>
                        <span className="text-xs text-emerald-800">
                          All teachers, modules, batches, and schedules are synchronized in real-time
                          and mirrored to the immutable RAID backup schema.
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

                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-stone-800">
                        <HardDrive size={14} className="text-stone-600" />
                        RAID Immutable Backup Status:
                      </div>
                      <p className="text-stone-600">
                        Every single change is duplicated automatically to both{" "}
                        <code>backup.records</code> and <code>public.backups</code>. Backup data has{" "}
                        <strong>Row Level Security without DELETE/UPDATE</strong>, guaranteeing that
                        no accidental click in the web app can erase backup records.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm text-stone-700">
                    <p>
                      Connect your routine to a free <strong>Supabase</strong> PostgreSQL database
                      with RAID backup protection so your schedule and history are safe forever.
                    </p>

                    <div className="rounded-md border border-stone-200 bg-stone-50 p-2.5 text-xs space-y-2">
                      <div className="font-semibold text-stone-800">
                        Step 1: Run Schema &amp; Backup Script in Supabase
                      </div>
                      <p className="text-stone-600">
                        Go to your Supabase project's <strong>SQL Editor</strong>, paste this query,
                        and run it:
                      </p>
                      <div className="relative">
                        <pre className="p-2 bg-stone-900 text-stone-100 rounded text-[11px] overflow-x-auto max-h-40">
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
                      <div className="font-semibold text-stone-800">
                        Step 2: Add credentials to <code>.env.local</code>
                      </div>
                      <p className="text-stone-600">
                        In your project root, open <code>.env.local</code> and fill in your Project
                        URL and Anon Key:
                      </p>
                      <pre className="p-2 bg-stone-900 text-stone-100 rounded text-[11px] overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
                      </pre>
                      <p className="text-[11px] text-stone-500">
                        Then restart the dev server to connect. For GitHub Pages, set the same two
                        names as repository Actions secrets. After the tables exist, run
                        supabase/migration_add_auth_roles.sql and turn off email confirmation.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB 2: RAID Backups & Recovery */}
            {activeTab === "backups" && (
              <div className="space-y-3">
                {/* Security info box */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-900 flex items-start gap-2">
                  <ShieldCheck size={16} className="text-emerald-700 mt-0.5 shrink-0" />
                  <div>
                    <strong>Accidental Click Protection Active:</strong>
                    <div className="text-[11px] text-emerald-800 mt-0.5">
                      All changes to teachers, batches, modules, and schedules are mirrored here.
                      Backups cannot be deleted through the app or client API (Row Level Security
                      blocks all client deletes). If something was accidentally removed or edited,
                      click <strong>Restore</strong> to bring it back.
                    </div>
                  </div>
                </div>

                {/* Filter pills and refresh */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    {(["all", "teachers", "batches", "modules", "schedules"] as const).map(
                      (type) => (
                        <button
                          key={type}
                          type="button"
                          className={`rounded-full px-2.5 py-0.5 text-xs capitalize transition ${
                            backupTypeFilter === type
                              ? "bg-stone-900 text-white font-medium"
                              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                          }`}
                          onClick={() => setBackupTypeFilter(type)}
                        >
                          {type}
                        </button>
                      ),
                    )}
                  </div>
                  <Button
                    tone="ghost"
                    className="text-xs py-1"
                    onClick={() => void loadBackups(backupTypeFilter)}
                    disabled={loadingBackups}
                  >
                    <RefreshCw size={12} className={loadingBackups ? "animate-spin" : ""} /> Refresh
                  </Button>
                </div>

                {/* Feedback */}
                {restoreFeedback && (
                  <div
                    className={`rounded-md p-2 text-xs font-semibold ${
                      restoreFeedback.startsWith("✓")
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : "bg-rose-100 text-rose-900 border border-rose-300"
                    }`}
                  >
                    {restoreFeedback}
                  </div>
                )}

                {/* Backups List */}
                <div className="max-h-72 overflow-y-auto rounded-lg border border-stone-200 bg-white divide-y divide-stone-100">
                  {loadingBackups ? (
                    <div className="p-6 text-center text-xs text-stone-500 flex items-center justify-center gap-2">
                      <RefreshCw size={14} className="animate-spin text-stone-400" />
                      Loading RAID backup records...
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="p-6 text-center text-xs text-stone-500">
                      <History size={20} className="mx-auto mb-1 text-stone-300" />
                      No backup records found for this filter yet.
                    </div>
                  ) : (
                    backups.map((b) => {
                      const isDel = b.operation === "DELETE";
                      const isUpd = b.operation === "UPDATE";
                      const isIns = b.operation === "INSERT";

                      return (
                        <div
                          key={b.id}
                          className="p-2.5 flex items-center justify-between gap-3 hover:bg-stone-50 text-xs transition"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                                  isDel
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : isUpd
                                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                                    : isIns
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                    : "bg-sky-100 text-sky-800 border border-sky-200"
                                }`}
                              >
                                {b.operation}
                              </span>

                              <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[10px] text-stone-600 font-mono">
                                {b.type}
                              </span>

                              <span className="text-[11px] text-stone-400">
                                {new Date(b.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </span>
                            </div>

                            <div className="truncate text-stone-800">
                              {renderBackupPreview(b)}
                            </div>
                          </div>

                          <Button
                            tone={isDel ? "primary" : "ghost"}
                            className="shrink-0 text-xs py-1 px-2.5 flex items-center gap-1"
                            onClick={() => void handleRestore(b)}
                            disabled={restoringId === b.id}
                          >
                            <RotateCcw
                              size={12}
                              className={restoringId === b.id ? "animate-spin" : ""}
                            />
                            {restoringId === b.id ? "Restoring..." : "Restore"}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-4 flex justify-between items-center border-t border-stone-100 pt-3">
              <span className="text-[11px] text-stone-400 flex items-center gap-1">
                <ShieldCheck size={12} /> Immutable RAID Architecture
              </span>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

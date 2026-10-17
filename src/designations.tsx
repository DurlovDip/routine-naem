import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./components/ui";
import { isAuthMock, useAuth } from "./auth";
import {
  builtinDesignations,
  designationChoices,
  isMissingDesignationsTable,
  type DesignationRow,
} from "./lib/designations";
import { supabase } from "./lib/supabase";
import { useSchedule } from "./state";

const LOCAL_KEY = "routine-naem-designations";

type Catalog = {
  rows: DesignationRow[];
  names: string[];
  source: "table" | "builtin";
  error: string | null;
  add: (name: string) => Promise<string | null>;
  rename: (id: string, name: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
};

const DesignationContext = createContext<Catalog | null>(null);

function readLocal(): DesignationRow[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignationRow[];
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((row) => row && typeof row.id === "string" && typeof row.name === "string" && row.name.trim());
  } catch {
    return null;
  }
}

function writeLocal(rows: DesignationRow[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
}

export function DesignationsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { state, dispatch } = useSchedule();
  const [rows, setRows] = useState<DesignationRow[]>(() => readLocal() ?? builtinDesignations());
  const [source, setSource] = useState<"table" | "builtin">("builtin");
  const [error, setError] = useState<string | null>(null);

  const extras = state.teachers.map((teacher) => teacher.designation);
  const names = useMemo(() => designationChoices(rows.map((row) => row.name), extras), [rows, extras]);

  const reload = useCallback(async () => {
    if (isAuthMock || !supabase) {
      setRows(readLocal() ?? builtinDesignations());
      setSource("builtin");
      setError(null);
      return;
    }
    const { data, error: readError } = await supabase.from("designations").select("id, name").order("name");
    if (readError) {
      setRows(readLocal() ?? builtinDesignations());
      setSource("builtin");
      setError(isMissingDesignationsTable(readError.message) ? null : readError.message);
      return;
    }
    setRows((data ?? []) as DesignationRow[]);
    setSource("table");
    setError(null);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, auth.session?.role]);

  function requireEditor(): string | null {
    if (auth.required && auth.session?.role !== "super_admin") return "Only a super admin can edit designations.";
    return null;
  }

  function remember(next: DesignationRow[]) {
    setRows(next);
    if (source === "builtin") writeLocal(next);
  }

  const add = useCallback(
    async (name: string) => {
      const denied = requireEditor();
      if (denied) return denied;
      const next = name.trim();
      if (!next) return "Enter a designation.";
      if (rows.some((row) => row.name.toLowerCase() === next.toLowerCase())) return "That designation is already in the list.";
      if (source === "table" && supabase) {
        const { error: insertError } = await supabase.from("designations").insert({ name: next });
        if (insertError) return insertError.message;
        await reload();
        return null;
      }
      remember([...rows, { id: `local-${crypto.randomUUID()}`, name: next }]);
      return null;
    },
    [rows, source, reload, auth.required, auth.session?.role],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const denied = requireEditor();
      if (denied) return denied;
      const current = rows.find((row) => row.id === id);
      const next = name.trim();
      if (!current || !next || next === current.name) return null;
      if (rows.some((row) => row.id !== id && row.name.toLowerCase() === next.toLowerCase())) {
        return "That designation is already in the list.";
      }
      if (source === "table" && supabase) {
        const { error: updateError } = await supabase.from("designations").update({ name: next }).eq("id", id);
        if (updateError) return updateError.message;
        await supabase.from("teachers").update({ designation: next }).eq("designation", current.name);
      } else {
        remember(rows.map((row) => (row.id === id ? { ...row, name: next } : row)));
      }
      for (const teacher of state.teachers) {
        if ((teacher.designation ?? "").toLowerCase() === current.name.toLowerCase()) {
          dispatch({ type: "set-teacher-designation", id: teacher.id, designation: next });
        }
      }
      if (source === "table") await reload();
      return null;
    },
    [rows, source, reload, state.teachers, dispatch, auth.required, auth.session?.role],
  );

  const remove = useCallback(
    async (id: string) => {
      const denied = requireEditor();
      if (denied) return denied;
      if (source === "table" && supabase) {
        const { error: deleteError } = await supabase.from("designations").delete().eq("id", id);
        if (deleteError) return deleteError.message;
        await reload();
        return null;
      }
      remember(rows.filter((row) => row.id !== id));
      return null;
    },
    [rows, source, reload, auth.required, auth.session?.role],
  );

  const value = useMemo<Catalog>(
    () => ({ rows, names, source, error, add, rename, remove }),
    [rows, names, source, error, add, rename, remove],
  );

  return <DesignationContext.Provider value={value}>{children}</DesignationContext.Provider>;
}

export function useDesignations(): Catalog {
  const value = useContext(DesignationContext);
  if (!value) throw new Error("useDesignations must be used inside DesignationsProvider");
  return value;
}

export function DesignationManager() {
  const catalog = useDesignations();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function addName() {
    const result = await catalog.add(draft);
    setMessage(result);
    if (!result) setDraft("");
  }

  return (
    <div>
      <div className="field-label">Designations</div>
      <p className="hint mb-2">
        Titles shown in the role list.
        {catalog.source === "builtin" ? " Using the built-in list until supabase/migration_add_designations.sql has been run." : ""}
      </p>
      {catalog.error ? <p className="auth-error">{catalog.error}</p> : null}
      {message ? <p className="auth-error">{message}</p> : null}
      <ul className="settings-list space-y-2">
        {catalog.rows.map((row) => (
          <DesignationNameRow
            key={row.id}
            row={row}
            onRename={async (name) => setMessage(await catalog.rename(row.id, name))}
            onRemove={async () => setMessage(await catalog.remove(row.id))}
          />
        ))}
      </ul>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void addName();
        }}
      >
        <input
          className="field flex-1"
          aria-label="New designation"
          placeholder="New designation"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" tone="primary">
          Add designation
        </Button>
      </form>
    </div>
  );
}

function DesignationNameRow({
  row,
  onRename,
  onRemove,
}: {
  row: DesignationRow;
  onRename: (name: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [name, setName] = useState(row.name);
  useEffect(() => setName(row.name), [row.name]);
  return (
    <li className="settings-item flex items-center gap-2">
      <input
        className="field flex-1"
        aria-label={`Rename ${row.name}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void onRename(name)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      <button type="button" className="icon-btn" aria-label={`Remove ${row.name}`} onClick={() => void onRemove()}>
        <Trash2 size={14} />
      </button>
    </li>
  );
}

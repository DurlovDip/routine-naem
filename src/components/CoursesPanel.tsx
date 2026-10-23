import { useState } from "react";
import { useCourses } from "../courses";
import { courseStatusLabel, isCourseStatus, type CourseDraft, type CourseStatus, type CourseSummary } from "../lib/courses";
import { Button } from "./ui";

const FILTERS = ["all", "active", "inactive", "ended"] as const;
type Filter = (typeof FILTERS)[number];

function draftFrom(course?: CourseSummary): CourseDraft {
  return {
    name: course?.name ?? "",
    code: course?.code ?? "",
    status: course?.status ?? "active",
    startDate: course?.startDate ?? "",
    endDate: course?.endDate ?? "",
  };
}

function clean(draft: CourseDraft): CourseDraft {
  return {
    name: draft.name.trim(),
    code: draft.code?.trim() ? draft.code.trim() : null,
    status: draft.status,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
  };
}

export function CoursesPanel() {
  const { courses, createCourse, updateCourse, selectCourse, selected } = useCourses();
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState<CourseDraft>(draftFrom());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = filter === "all" ? courses : courses.filter((course) => course.status === filter);

  async function create() {
    setBusy(true);
    const message = await createCourse(clean(draft));
    setBusy(false);
    setError(message);
    if (!message) setDraft(draftFrom());
  }

  return (
    <div className="access-panel courses-panel" id="courses-panel">
      <p className="hint">
        Several courses can be active at once. Teachers can read active and ended courses. Inactive courses are hidden from them. An ended course is read-only except for a super admin. Header, footer, and batches are saved with that course.
      </p>
      <div className="segmented" role="group" aria-label="Course status">
        {FILTERS.map((item) => (
          <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item === "all" ? "All" : courseStatusLabel(item)}
          </button>
        ))}
      </div>
      <form
        className="course-card course-create"
        aria-labelledby="new-course-heading"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className="course-card-head">
          <h3 id="new-course-heading">New course</h3>
        </div>
        <div className="course-fields">
          <label>
            <span className="field-label">Name</span>
            <input
              className="field"
              aria-label="New course name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span className="field-label">Short name</span>
            <input
              className="field"
              aria-label="New course short name"
              value={draft.code ?? ""}
              onChange={(event) => setDraft({ ...draft, code: event.target.value })}
            />
          </label>
          <label>
            <span className="field-label">Starts</span>
            <input
              className="field"
              type="date"
              aria-label="New course start"
              value={draft.startDate ?? ""}
              onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
            />
          </label>
          <label>
            <span className="field-label">Ends</span>
            <input
              className="field"
              type="date"
              aria-label="New course end"
              value={draft.endDate ?? ""}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
            />
          </label>
        </div>
        <div className="course-actions">
          <label className="course-status-field">
            <span className="field-label">Status</span>
            <select
              className="field"
              aria-label="New course status"
              value={draft.status}
              onChange={(event) => {
                if (isCourseStatus(event.target.value)) setDraft({ ...draft, status: event.target.value });
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="ended">Ended</option>
            </select>
          </label>
          <Button tone="primary" type="submit" disabled={busy || !draft.name.trim()}>
            {busy ? "Saving…" : "Create course"}
          </Button>
        </div>
      </form>
      {error ? <p className="auth-error">{error}</p> : null}
      {shown.length === 0 ? <p className="hint">No courses in this filter.</p> : null}
      <ul className="course-list">
        {shown.map((course) => (
          <CourseRow
            key={course.id}
            course={course}
            current={course.id === selected?.id}
            onOpen={() => selectCourse(course.id)}
            onSave={async (next) => {
              const message = await updateCourse(course.id, clean(next));
              setError(message);
              return message;
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function CourseRow({
  course,
  current,
  onOpen,
  onSave,
}: {
  course: CourseSummary;
  current: boolean;
  onOpen: () => void;
  onSave: (draft: CourseDraft) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<CourseDraft>(draftFrom(course));
  const [busy, setBusy] = useState(false);

  function setStatus(status: CourseStatus) {
    const next = { ...draft, status };
    setDraft(next);
    setBusy(true);
    void onSave(next).finally(() => setBusy(false));
  }

  return (
    <li className="course-card">
      <div className="course-card-head">
        <strong>{course.name}</strong>
        <span className={`course-badge course-badge-${draft.status}`}>
          {courseStatusLabel(draft.status)}
          {current ? " · open" : ""}
          {course.canEdit ? "" : " · read only"}
        </span>
      </div>
      <div className="course-fields">
        <label>
          <span className="field-label">Name</span>
          <input
            className="field"
            aria-label={`Name for ${course.name}`}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          <span className="field-label">Short name</span>
          <input
            className="field"
            aria-label={`Short name for ${course.name}`}
            value={draft.code ?? ""}
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          />
        </label>
        <label>
          <span className="field-label">Starts</span>
          <input
            className="field"
            type="date"
            aria-label={`Start for ${course.name}`}
            value={draft.startDate ?? ""}
            onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
          />
        </label>
        <label>
          <span className="field-label">Ends</span>
          <input
            className="field"
            type="date"
            aria-label={`End for ${course.name}`}
            value={draft.endDate ?? ""}
            onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
          />
        </label>
      </div>
      <div className="course-actions">
        <div className="segmented" role="group" aria-label={`Status for ${course.name}`}>
          {(["active", "inactive", "ended"] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={draft.status === status}
              disabled={busy}
              onClick={() => setStatus(status)}
            >
              {courseStatusLabel(status)}
            </button>
          ))}
        </div>
        <Button
          tone="primary"
          disabled={busy || !draft.name.trim()}
          onClick={() => {
            setBusy(true);
            void onSave(draft).finally(() => setBusy(false));
          }}
        >
          {busy ? "Saving…" : "Save course"}
        </Button>
        <Button disabled={current} onClick={onOpen}>
          Open routine
        </Button>
      </div>
    </li>
  );
}

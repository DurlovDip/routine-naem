import { Pencil } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import type { DayWhen } from "../lib/time";
import { colors, radius, space, type as typeScale, type FontWeight } from "../theme";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ==========================================================================
   Typography: T
   ========================================================================== */

export function T({
  weight = "regular",
  className,
  style,
  children,
  as: Component = "span",
  ...props
}: {
  weight?: FontWeight;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  as?: any;
  [key: string]: any;
}) {
  const weightClass =
    weight === "bold"
      ? "font-bold"
      : weight === "semibold"
        ? "font-semibold"
        : weight === "medium"
          ? "font-medium"
          : "font-normal";

  return (
    <Component
      className={cx("ui-text", weightClass, className)}
      style={{ color: colors.ink, ...style }}
      {...props}
    >
      {children}
    </Component>
  );
}

/* ==========================================================================
   Label & Hint
   ========================================================================== */

export function Label({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cx("ui-label font-semibold", className)}
      style={{
        fontSize: typeScale.caption,
        color: colors.muted,
        marginBottom: space.xs,
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function hintStyle(): CSSProperties {
  return { color: colors.muted, fontSize: 12, marginTop: 4 };
}

/* ==========================================================================
   Field (supports both direct input control & label wrapper)
   ========================================================================== */

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  children?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, children, className, style, ...inputProps },
  ref
) {
  // If children are passed, act as a labeled container
  if (children) {
    return (
      <label className={cx("block", className)} style={style}>
        {label ? <Label>{label}</Label> : null}
        {children}
        {hint ? <div style={hintStyle()}>{hint}</div> : null}
      </label>
    );
  }

  // Otherwise, render an input
  const inputEl = (
    <input
      ref={ref}
      className={cx("ui-field w-full", className)}
      style={{
        backgroundColor: colors.paper,
        color: colors.ink,
        borderRadius: radius.md,
        padding: "10px 14px",
        fontSize: typeScale.body,
        minHeight: 48,
        border: "1px solid transparent",
        outline: "none",
        ...style,
      }}
      {...inputProps}
    />
  );

  if (label) {
    return (
      <label className="block">
        <Label>{label}</Label>
        {inputEl}
        {hint ? <div style={hintStyle()}>{hint}</div> : null}
      </label>
    );
  }

  return inputEl;
});

/* ==========================================================================
   Button
   ========================================================================== */

export function Button({
  label,
  icon,
  onPress,
  onClick,
  tone = "ghost",
  disabled,
  small,
  square,
  testID,
  accessibilityLabel,
  children,
  className,
  style,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
  icon?: ReactNode;
  onPress?: () => void;
  tone?: "primary" | "ghost" | "danger" | "quiet";
  disabled?: boolean;
  small?: boolean;
  square?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    onClick?.(e);
    onPress?.();
  };

  return (
    <button
      type={type}
      data-testid={testID}
      aria-label={accessibilityLabel ?? label}
      disabled={disabled}
      onClick={handleClick}
      className={cx(
        "ui-button inline-flex items-center justify-center font-semibold transition-colors select-none",
        tone === "primary" && "ui-button-primary",
        tone === "ghost" && "ui-button-ghost",
        tone === "danger" && "ui-button-danger",
        tone === "quiet" && "ui-button-quiet",
        small && "ui-button-small",
        square && "ui-button-square",
        disabled && "opacity-45 pointer-events-none",
        className
      )}
      style={{
        borderRadius: radius.md,
        gap: space.sm,
        minHeight: square ? 44 : small ? 36 : 48,
        width: square ? 44 : undefined,
        padding: square ? 0 : small ? "6px 12px" : "12px 18px",
        fontSize: small ? 12 : typeScale.label,
        ...style,
      }}
      {...props}
    >
      {icon}
      {label ?? children}
    </button>
  );
}

/* ==========================================================================
   DayChip
   ========================================================================== */

export function DayChip({
  label,
  selected,
  when,
  onPress,
  onClick,
  onEdit,
}: {
  label: string;
  selected: boolean;
  when: DayWhen;
  onPress?: () => void;
  onClick?: () => void;
  onEdit?: () => void;
}) {
  const handleSelect = onClick ?? onPress;

  const bg = selected
    ? colors.accent
    : when === "past"
      ? colors.chipPast
      : colors.surface;

  const color = selected
    ? "#ffffff"
    : when === "past"
      ? colors.chipPastText
      : colors.ink;

  const borderColor = selected
    ? colors.accent
    : when === "past"
      ? colors.chipPast
      : colors.chipOpenBorder;

  if (selected && onEdit) {
    return (
      <div
        className="inline-flex items-center overflow-hidden transition-colors"
        style={{
          backgroundColor: bg,
          borderColor,
          borderWidth: 1,
          borderStyle: "solid",
          borderRadius: radius.md,
          height: 36,
        }}
      >
        <button
          type="button"
          aria-label={`Day ${label}`}
          aria-pressed={true}
          onClick={handleSelect}
          className="h-full px-3 flex items-center justify-center text-xs font-semibold cursor-pointer"
          style={{ color }}
        >
          {label}
        </button>
        <div style={{ width: 1, height: 16, backgroundColor: "rgba(255, 255, 255, 0.4)" }} />
        <button
          type="button"
          data-testid="edit-day-chip"
          aria-label="Edit day info"
          onClick={onEdit}
          className="h-full px-2.5 flex items-center justify-center cursor-pointer hover:opacity-80"
          style={{ color: "#ffffff" }}
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Day ${label}`}
      aria-pressed={selected}
      onClick={handleSelect}
      className="inline-flex items-center justify-center px-3 text-xs font-semibold cursor-pointer transition-colors"
      style={{
        backgroundColor: bg,
        color,
        borderColor,
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: radius.md,
        height: 36,
      }}
    >
      {label}
    </button>
  );
}

/* ==========================================================================
   BatchChip
   ========================================================================== */

export function BatchChip({
  label,
  selected,
  onPress,
  onClick,
  onEdit,
}: {
  label: string;
  selected: boolean;
  onPress?: () => void;
  onClick?: () => void;
  onEdit?: () => void;
}) {
  const handleSelect = onClick ?? onPress;

  if (selected && onEdit) {
    return (
      <div
        className="inline-flex items-center overflow-hidden transition-colors"
        style={{
          backgroundColor: colors.accent,
          borderRadius: radius.md,
          height: 36,
        }}
      >
        <button
          type="button"
          data-testid={`batch-chip-${label}`}
          aria-pressed={true}
          onClick={handleSelect}
          className="h-full px-3 flex items-center justify-center text-xs font-semibold text-white cursor-pointer"
        >
          {label}
        </button>
        <div style={{ width: 1, height: 16, backgroundColor: "rgba(255, 255, 255, 0.4)" }} />
        <button
          type="button"
          data-testid="edit-batch-chip"
          aria-label="Edit batch info"
          onClick={onEdit}
          className="h-full px-2.5 flex items-center justify-center text-white cursor-pointer hover:opacity-80"
        >
          <Pencil size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={`batch-chip-${label}`}
      aria-pressed={selected}
      onClick={handleSelect}
      className="inline-flex items-center justify-center px-3 text-xs font-semibold cursor-pointer transition-colors"
      style={{
        backgroundColor: selected ? colors.accent : colors.paper,
        color: selected ? "#ffffff" : colors.ink,
        borderRadius: radius.md,
        height: 36,
      }}
    >
      {label}
    </button>
  );
}

/* ==========================================================================
   Segmented
   ========================================================================== */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  scrollable = false,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label?: string;
  scrollable?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx(
        "ui-segmented inline-flex p-1 gap-1",
        scrollable ? "overflow-x-auto max-w-full" : "w-full",
        className
      )}
      style={{
        backgroundColor: colors.paper,
        borderRadius: radius.md,
      }}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(option.value)}
            className={cx(
              "ui-segmented-btn flex items-center justify-center text-xs font-medium py-2 px-3 transition-colors cursor-pointer whitespace-nowrap",
              scrollable ? "flex-none" : "flex-1",
              on ? "font-semibold shadow-sm" : ""
            )}
            style={{
              borderRadius: radius.sm,
              backgroundColor: on ? colors.surface : "transparent",
              color: on ? colors.accent : colors.muted,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   CheckRow
   ========================================================================== */

export function CheckRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <label
      data-testid={testID}
      className="flex items-center gap-2 cursor-pointer select-none py-1"
      onClick={(e) => {
        e.preventDefault();
        onChange(!value);
      }}
    >
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center transition-colors flex-none"
        style={{
          backgroundColor: value ? colors.accent : colors.paper,
        }}
      >
        {value ? <span className="text-white text-xs leading-none">✓</span> : null}
      </div>
      <div className="flex-1 text-sm" style={{ color: colors.ink }}>
        {label}
      </div>
    </label>
  );
}

/* ==========================================================================
   Select (Modal/Popover Dropdown)
   ========================================================================== */

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "—",
  allowEmpty = true,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const clean = options.map((opt) => (typeof opt === "string" ? opt.trim() : "")).filter(Boolean);
  const unique = clean.filter((option, index) => clean.indexOf(option) === index);
  const rows = allowEmpty ? ["", ...unique] : unique;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="ui-select flex items-center gap-2 px-3 text-left w-full cursor-pointer"
        style={{
          backgroundColor: colors.paper,
          borderRadius: radius.md,
          minHeight: 48,
          color: colors.ink,
        }}
      >
        <span
          className="flex-1 truncate text-sm"
          style={{ color: value ? colors.ink : colors.muted }}
        >
          {value || placeholder}
        </span>
        <span className="text-xs" style={{ color: colors.muted }}>
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(28, 28, 26, 0.28)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden animate-in fade-in"
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              boxShadow: "0 12px 32px rgba(28, 28, 26, 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-5 pt-4 pb-2 text-base font-semibold border-b"
              style={{ color: colors.ink, borderColor: colors.line }}
            >
              {label}
            </div>
            <div className="overflow-y-auto py-2">
              {rows.map((item, index) => {
                const selected = item === value;
                return (
                  <button
                    key={`${item}-${index}`}
                    type="button"
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    className="w-full text-left px-5 py-3 text-sm transition-colors cursor-pointer flex items-center justify-between"
                    style={{
                      backgroundColor: selected ? colors.accentSoft : "transparent",
                      color: selected ? colors.accent : colors.ink,
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    <span>{item || "Clear"}</span>
                    {selected ? <span>✓</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ==========================================================================
   Section & ConfirmDialog (Preserved for compatibility)
   ========================================================================== */

export function Section({
  title,
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx("section", className)}>
      <button
        type="button"
        className="section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="section-title">{title}</span>
        <span className="text-xs text-stone-500">{open ? "Hide" : summary || "Show"}</span>
      </button>
      {open ? <div className="section-body">{children}</div> : null}
    </section>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(28, 28, 26, 0.3)" }}
      role="presentation"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-sm p-6"
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          boxShadow: "0 12px 32px rgba(28, 28, 26, 0.15)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-base font-semibold mb-2" style={{ color: colors.ink }}>
          {title}
        </h2>
        <p className="text-sm mb-5" style={{ color: colors.muted }}>
          {body}
        </p>
        <div className="flex justify-end gap-2">
          <Button tone="ghost" small onClick={onCancel}>
            Cancel
          </Button>
          <Button tone={tone} small onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

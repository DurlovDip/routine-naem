import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./ui";

export function PlainSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  placeholder = "—",
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0, width: 140, maxHeight: 240 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 148);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
    const roomBelow = window.innerHeight - rect.bottom - 12;
    const roomAbove = rect.top - 12;
    const openUp = roomBelow < 160 && roomAbove > roomBelow;
    const maxHeight = Math.max(120, Math.min(260, openUp ? roomAbove : roomBelow));
    const top = openUp ? Math.max(8, rect.top - 4 - maxHeight) : rect.bottom + 4;
    setBox({ top, left, width, maxHeight });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => place();
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <div className={cx("plain-select", className, open && "open")} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="plain-select-btn"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={value ? "plain-select-value" : "plain-select-empty"}>{value || placeholder}</span>
        <ChevronDown size={12} className="plain-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <ul
          id={listId}
          className="plain-menu"
          role="listbox"
          style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {placeholder}
            </button>
          </li>
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

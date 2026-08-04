"use client";

import { useEffect, useId, useRef, useState } from "react";

/* One of the board's three search fields.
 *
 * WHY THIS IS NOT A <datalist>. It was one, and the popup a browser draws for a
 * datalist is chrome, not page: it renders in the system font at the system
 * size, sets its own width, and places itself where it likes, so next to a
 * page set in Hanken Grotesk it read as something borrowed from another
 * application, and sat visibly off the field it belonged to (Mehek, 2026-07-29).
 * None of that is reachable from CSS. Owning the list is the only way to have it
 * sit under the field, at the field's width, in the page's own type.
 *
 * What it keeps from the plain input, because these were the reasons for the
 * datalist in the first place:
 * - Free text. Nothing is rejected; the list is a suggestion, never a gate.
 * - A real form field. The value submits with the surrounding GET form, so a
 *   search stays a shareable URL and the page stays server-rendered.
 * - The keyboard. Arrow keys move, Enter picks, Escape closes, Tab leaves.
 * - No JavaScript required to search. Without JS the list never opens and the
 *   field is an ordinary text box that still submits, which is the same thing
 *   a datalist degrades to.
 */
export function ComboField({
  name,
  label,
  placeholder,
  value,
  options,
}: {
  name: string;
  label: string;
  placeholder: string;
  value: string;
  options: string[];
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  /* Substring, not prefix: someone typing "engineer" means to find "Software
     Engineer", and a prefix match would offer them nothing. */
  const needle = text.trim().toLowerCase();
  const matches = needle
    ? options.filter((o) => o.toLowerCase().includes(needle))
    : options;

  /* Close when the click lands anywhere else. Pointerdown rather than click so
     the list is gone before the next control takes focus. */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  /* Keep the highlighted row in view when arrowing past the fold. */
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (option: string) => {
    setText(option);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => {
        const next = current + step;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }
    /* Enter picks the highlighted row, and MUST NOT submit the form while doing
       so, otherwise choosing a suggestion searches for whatever was half-typed
       instead of what was chosen. With nothing highlighted, Enter submits as it
       would on any text field. */
    if (event.key === "Enter" && open && active >= 0 && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    }
  };

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={`${listId}-input`}
        className="font-mono text-label font-medium uppercase tracking-[0.08em] text-faint"
      >
        {label}
      </label>
      <input
        id={`${listId}-input`}
        /* Not type="search": Chrome and Safari add their own clear button and
           padding to it, which is one more piece of borrowed chrome sitting in
           a field the page is trying to own. */
        type="text"
        name={name}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="min-h-[44px] w-full rounded-inner border border-border bg-white px-4 text-base text-ink placeholder:text-faint focus:border-brand focus:outline-none"
      />
      {open && matches.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          /* top-full + inset-x-0: directly under the field and exactly its
             width, which is the whole point of not using a datalist. */
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-inner border border-border bg-white py-1 shadow-overlay"
        >
          {matches.map((option, index) => (
            <li
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              /* Mousedown, not click: click fires after blur, and blur would
                 have closed the list before the choice landed. */
              onPointerDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              onPointerEnter={() => setActive(index)}
              className={`cursor-pointer px-4 py-2 text-base ${
                index === active ? "bg-surface-alt text-ink" : "text-muted"
              }`}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

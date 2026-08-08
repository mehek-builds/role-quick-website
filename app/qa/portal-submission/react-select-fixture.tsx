"use client";

/* A REACT SELECT, REPRODUCED CLASS FOR CLASS AND ID FOR ID.
 *
 * Greenhouse's School, Degree, Discipline and graduation-month controls are react-select, and every
 * one of the production selectors is written against its DOM contract:
 *
 *   portalSubmission.ts:535  `#react-select-${inputId}-option-0`
 *   portalSubmission.ts:566  `[id="react-select-${inputId}-listbox"]`
 *   portalSubmission.ts:725  `[id^="react-select-"][id*="-option-"]:has-text("...")`
 *   portalSubmission.ts:1115 `[id^="react-select-"][id$="-option-0"]:visible`
 *   READ_SUBMIT_READINESS_SCRIPT reads `.select__single-value` and `.select__placeholder` for the
 *                               answer, and `[aria-required="true"]` for requiredness, because a
 *                               react-select has no `required` attribute anywhere.
 *
 * So the ids here are not decoration. `inputId="discipline--0"` is Greenhouse's own id and produces
 * `#react-select-discipline--0-option-0` exactly as the live form does. A fixture that used its own
 * naming would exercise none of those selectors and would pass whatever the adapter did.
 *
 * The four behaviours reproduced on purpose, each because a production run turned on it:
 *
 *  1. LATE MENU. Measured on Greenhouse: options arrive 555 to 563 ms after the click. Until then
 *     the menu is open and holds `.select__loading-message`, which carries NO option id, so a
 *     count() taken at 150 ms sees zero options. That gap is what sent the runner into a page-wide
 *     sweep, and a fixture whose menu is synchronous cannot catch a timing regression.
 *  2. backspaceRemovesValue. With no search text and a value set, Backspace or Delete clears the
 *     selection. Playwright's fill('') on a non-empty input presses Delete rather than typing, so
 *     `await control.fill('')` in the managed sweep IS this keystroke. That is how a later candidate
 *     emptied a control an earlier one had answered.
 *  3. THE CLEAR CONTROL. react-select renders `role="button" aria-label="Clear selections"` inside
 *     the widget, and the managed sweep's control list is `..., button, [role="button"]`, so the
 *     widget's own clear button is a candidate the sweep will click. Reproduced here so that path
 *     is exercised rather than assumed absent.
 *  4. THE SEARCH BOX IS NOT THE ANSWER. Selecting an option CLEARS the search text and writes
 *     `.select__single-value`; typing text that matches nothing leaves the text sitting in the
 *     combobox input with the placeholder still showing. Reading the input back therefore reports
 *     an answer for a control that holds none, which is exactly what filled_fields did.
 */

import { useEffect, useRef, useState } from "react";
import { qaMirror, qaRecord } from "./qa-instrument";

/* Measured on live Greenhouse postings: 555 ms and 563 ms from click to options. 560 sits between
   them. Named rather than inlined so a trial can reason about it and so the number carries its
   provenance. */
export const GREENHOUSE_MENU_RENDER_MS = 560;

export type RequiredMarker =
  /* aria-required="true" on the combobox input. This is what a real Greenhouse required select
     carries, and what READ_SUBMIT_READINESS_SCRIPT keys on. */
  | "aria"
  /* A red asterisk in the label and NOTHING else: no required attribute, no aria-required. Real
     Greenhouse forms do this, and a gate keyed on [required] or [aria-required] cannot see it. */
  | "asterisk"
  | "none";

export function ReactSelectFixture({
  inputId,
  label,
  options,
  initialValue,
  marker = "aria",
  clearable = true,
  menuDelayMs = GREENHOUSE_MENU_RENDER_MS,
  errorText,
}: {
  inputId: string;
  label: string;
  options: string[];
  initialValue?: string;
  marker?: RequiredMarker;
  clearable?: boolean;
  menuDelayMs?: number;
  errorText?: string;
}) {
  const [value, setValue] = useState<string | null>(initialValue ?? null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /* Mirrored so the REAL managed runner can read the control's answer with an `extract` action.
     `value-<inputId>` is the control's committed answer and `search-<inputId>` is the text sitting
     in the combobox input, and telling those two apart is the whole of defect 5: filled_fields
     claimed a field was answered because the runner read back its own typing. */
  useEffect(() => {
    qaMirror(`value-${inputId}`, value ?? "");
    qaMirror(`search-${inputId}`, search);
  }, [inputId, value, search]);

  /* CLICKING AN OPEN REACT SELECT CLOSES IT. That is real react-select behaviour and the production
     code already knows it: portalSubmission.ts, pushManagedReactSelectOptionProbeActions, closes a
     probed control with Escape rather than a second click, "because clicking an open react-select
     closes it". Without the toggle here the fixture is strictly easier than the live control, and
     the sequence that produced defect 3 cannot happen: the managed sweep's first move on a control
     is a click, so on a menu the preceding open-action already rendered, the sweep CLOSES the menu
     and then looks for an option 150 ms later with nothing on screen to find. That is the moment it
     reaches past the widget and clicks the job description. */
  const toggleMenu = () => {
    if (open) { setOpen(false); setMenuReady(false); qaRecord("menu_toggled_closed", inputId); return; }
    openMenu();
  };

  const openMenu = () => {
    if (open) return;
    setOpen(true);
    setMenuReady(false);
    qaRecord("menu_opened", inputId);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setMenuReady(true);
      qaRecord("menu_ready", inputId);
    }, menuDelayMs);
  };

  const pick = (option: string) => {
    setValue(option);
    // react-select clears its search text on selection. This single line is why reading the
    // combobox input back is never evidence that a control was answered.
    setSearch("");
    setOpen(false);
    setMenuReady(false);
    qaRecord("value_set", `${inputId}=${option}`);
  };

  const clear = (reason: string) => {
    if (value === null) return;
    qaRecord("value_cleared", `${inputId}:${reason}`);
    setValue(null);
  };

  const filtered = search.trim()
    ? options.filter((option) => option.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  return (
    <div className="field select__container col-span-full" data-litos-qa-field={inputId}>
      {/* A real <label for>, because the managed runner's fillByLabelText path finds the control by
          reading label text and then walking UP to the nearest block that contains a combobox. That
          walk is what puts the clear button in scope for the sweep, so a fixture without a proper
          label would silently skip the path that produced the defect. */}
      <label className="select__label block text-sm text-[#31312d]" id={`${inputId}-label`} htmlFor={inputId}>
        {label}
        {marker === "asterisk" || marker === "aria"
          ? <span className="required-asterisk text-[#c0392b]" aria-hidden="true"> *</span>
          : null}
      </label>
      <div
        className="select__control mt-2 flex items-center rounded-lg border border-[#cfcfc6] px-3 py-2"
        onMouseDown={toggleMenu}
      >
        <div className="select__value-container flex-1">
          {value
            ? <span className="select__single-value">{value}</span>
            : <span className="select__placeholder text-[#8b8b83]">Select...</span>}
          <input
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-labelledby={`${inputId}-label`}
            aria-controls={`react-select-${inputId}-listbox`}
            /* Deliberately only present for marker="aria". The whole point of marker="asterisk" is
               a control no attribute selector can find. */
            aria-required={marker === "aria" ? true : undefined}
            autoComplete="off"
            className="select__input ml-2 bg-transparent outline-none"
            value={search}
            onFocus={openMenu}
            onChange={(event) => {
              setSearch(event.target.value);
              qaRecord("search_typed", `${inputId}=${event.target.value}`);
              if (event.target.value) openMenu();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (open && menuReady && filtered.length > 0) pick(filtered[0]);
                else qaRecord("enter_ignored", inputId);
                return;
              }
              if (event.key === "Escape") { setOpen(false); setMenuReady(false); qaRecord("menu_escaped", inputId); return; }
              // backspaceRemovesValue. See the header: Playwright's fill('') is a Delete keypress on
              // a non-empty input, and both keys land here.
              if ((event.key === "Backspace" || event.key === "Delete") && search === "") clear(event.key.toLowerCase());
            }}
          />
        </div>
        <div className="select__indicators flex items-center gap-1">
          {clearable && value
            ? (
              <div
                role="button"
                aria-label="Clear selections"
                tabIndex={-1}
                className="select__clear-indicator cursor-pointer px-1 text-[#8b8b83]"
                onMouseDown={(event) => { event.stopPropagation(); clear("clear_selections_control"); }}
              >
                x
              </div>
            )
            : null}
          <div className="select__dropdown-indicator px-1 text-[#8b8b83]" aria-hidden="true">v</div>
        </div>
      </div>
      {open
        ? (
          <div className="select__menu absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[#cfcfc6] bg-white shadow-lg">
            <div
              className="select__menu-list"
              id={`react-select-${inputId}-listbox`}
              role="listbox"
              aria-labelledby={`${inputId}-label`}
            >
              {menuReady
                ? filtered.map((option, index) => (
                  <div
                    key={option}
                    id={`react-select-${inputId}-option-${index}`}
                    role="option"
                    aria-selected={option === value}
                    tabIndex={-1}
                    className="select__option cursor-pointer px-3 py-2 text-sm hover:bg-[#eef2ff]"
                    onClick={() => { qaRecord("option_clicked", `${inputId}=${option}`); pick(option); }}
                  >
                    {option}
                  </div>
                ))
                /* No option id, no role="option". A count() here sees nothing, which is precisely
                   what the 150 ms snapshot saw in production. */
                : <div className="select__loading-message px-3 py-2 text-sm text-[#8b8b83]">Loading...</div>}
              {menuReady && filtered.length === 0
                ? <div className="select__menu-notice--no-options px-3 py-2 text-sm text-[#8b8b83]">No options</div>
                : null}
            </div>
          </div>
        )
        : null}
      {errorText
        ? <div className="field-error mt-1 text-sm text-[#c0392b]">{errorText}</div>
        : null}
    </div>
  );
}

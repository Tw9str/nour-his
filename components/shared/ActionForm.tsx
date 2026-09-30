"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { submit, FeedbackError } from "@/services/api";
import type { Action, Fields } from "@/shared/validation";
import { western } from "@/shared/validation";
import { Icon } from "./Icons";
export type Values = Record<string, string | boolean>;
type Option = { value: string; label: string; description?: string };
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "password"
    | "date"
    | "email"
    | "number"
    | "textarea"
    | "select"
    | "checkbox"
    | "bed-grid";
  optional?: boolean;
  hint?: string;
  options?: Option[] | ((values: Values) => Option[]);
  wide?: boolean;
  dir?: "ltr" | "rtl";
  min?: number;
  step?: string;
  autoComplete?: string;
  reset?: string[];
};
type Feedback = {
  message: string;
  fields: Fields;
  success: boolean;
  revision: number;
};
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button primary" disabled={pending}>
      {pending ? (
        <>
          <span className="spinner" />
          جارٍ الحفظ…
        </>
      ) : (
        <>
          {label}
          <Icon name="check" size={18} />
        </>
      )}
    </button>
  );
}
export function ActionForm({
  action,
  fields,
  initial = {},
  build,
  onSuccess,
  onError,
  label = "حفظ",
  note,
}: {
  action: Action;
  fields: Field[];
  initial?: Values;
  build?: (v: Values) => unknown;
  onSuccess?: (
    result: Awaited<ReturnType<typeof submit>>,
  ) => void | Promise<void>;
  onError?: (error: unknown, input: unknown) => boolean;
  label?: string;
  note?: string;
}) {
  const [values, setValues] = useState<Values>(() => ({
    ...Object.fromEntries(
      fields.map((f) => [f.name, f.type === "checkbox" ? false : ""]),
    ),
    ...initial,
  }));
  const id = useId();
  const message = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const [state, formAction, pending] = useActionState(
    async (previous: Feedback) => {
      let input: unknown;
      try {
        input = build ? build(values) : values;
        const result = await submit(action, input);
        await onSuccess?.(result);
        return {
          message: "تم الحفظ بنجاح",
          fields: {},
          success: true,
          revision: previous.revision + 1,
        };
      } catch (error) {
        if (onError?.(error, input))
          return { ...previous, message: "", fields: {} };
        return {
          message:
            error instanceof FeedbackError
              ? error.message
              : "تعذر تأكيد العملية. تحقق من الاتصال وحاول مجددًا",
          fields: error instanceof FeedbackError ? error.fields : {},
          success: false,
          revision: previous.revision + 1,
        };
      } finally {
        lock.current = false;
      }
    },
    { message: "", fields: {}, success: false, revision: 0 },
  );
  useEffect(() => {
    if (state.revision) message.current?.focus();
  }, [state]);
  return (
    <form
      noValidate
      action={formAction}
      aria-busy={pending}
      onSubmit={(e) => {
        e.stopPropagation();
        if (lock.current) e.preventDefault();
        else lock.current = true;
      }}
    >
      {state.message && (
        <div
          ref={message}
          tabIndex={-1}
          role={state.success ? "status" : "alert"}
          className={`feedback ${state.success ? "success" : "error"}`}
        >
          <Icon name={state.success ? "success" : "alert"} />
          <div>
            <strong>{state.message}</strong>
            {Object.entries(state.fields).length > 0 && (
              <ul>
                {Object.entries(state.fields).map(([key, value]) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() =>
                        document.getElementById(`${id}-${key}`)?.focus()
                      }
                    >
                      {fields.find((f) => f.name === key)?.label || "القيمة"}:{" "}
                      {value}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <fieldset disabled={pending} className="form-fields">
        <div className="form-grid">
          {fields.map((f) => {
            const fieldId = `${id}-${f.name}`,
              error = state.fields[f.name];
            const change = (v: string | boolean) =>
              setValues((previous) => ({
                ...previous,
                [f.name]: v,
                ...Object.fromEntries((f.reset || []).map((k) => [k, ""])),
              }));
            const common = {
              id: fieldId,
              name: f.name,
              "aria-label": f.label,
              "aria-required": !f.optional,
              "aria-invalid": !!error,
              "aria-describedby": error
                ? fieldId + "-error"
                : f.hint
                  ? fieldId + "-hint"
                  : undefined,
            };
            if (f.type === "bed-grid") {
              const options =
                typeof f.options === "function"
                  ? f.options(values)
                  : f.options || [];
              return (
                <fieldset
                  key={f.name}
                  className="form-fields span-two bed-picker"
                  {...common}
                  tabIndex={-1}
                >
                  <legend className="field-label">
                    {f.label} · {options.length} متاح
                  </legend>
                  <div className="bed-picker-grid">
                    {options.map((option) => (
                      <label className="bed-choice" key={option.value}>
                        <input
                          type="radio"
                          name={f.name}
                          value={option.value}
                          checked={values[f.name] === option.value}
                          onChange={() => change(option.value)}
                          aria-label={`${option.label} · ${option.description}`}
                          required={!f.optional}
                        />
                        <span className="bed-tile">
                          <Icon name="bed" />
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                          <span>
                            {values[f.name] === option.value
                              ? "تم الاختيار"
                              : "متاح"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!options.length && (
                    <p className="muted">
                      لا توجد أسرة متاحة حاليًا. أضف سريرًا أو انتظر إخلاء أحد
                      الأسرة.
                    </p>
                  )}
                  {error && (
                    <small id={fieldId + "-error"} className="field-error">
                      {error}
                    </small>
                  )}
                </fieldset>
              );
            }
            return (
              <label
                key={f.name}
                className={`field ${f.wide ? "span-two" : ""} ${f.type === "checkbox" ? "check-field" : ""}`}
                htmlFor={fieldId}
              >
                <span className="field-label">
                  {f.label}
                  {f.optional && <small>اختياري</small>}
                </span>
                {f.type === "select" ? (
                  <select
                    {...common}
                    value={String(values[f.name])}
                    onChange={(e) => change(e.target.value)}
                  >
                    <option value="">اختر…</option>
                    {(typeof f.options === "function"
                      ? f.options(values)
                      : f.options || []
                    ).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    {...common}
                    value={String(values[f.name])}
                    rows={3}
                    maxLength={1000}
                    onChange={(e) => change(e.target.value)}
                  />
                ) : f.type === "checkbox" ? (
                  <input
                    {...common}
                    type="checkbox"
                    checked={!!values[f.name]}
                    onChange={(e) => change(e.target.checked)}
                  />
                ) : (
                  <input
                    {...common}
                    type={f.type === "number" ? "text" : f.type || "text"}
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    autoComplete={f.autoComplete || "off"}
                    dir={f.dir || (f.type === "number" ? "ltr" : undefined)}
                    value={String(values[f.name])}
                    onChange={(e) =>
                      change(
                        f.type === "number"
                          ? western(e.target.value)
                          : e.target.value,
                      )
                    }
                    maxLength={f.type === "password" ? 200 : 300}
                  />
                )}
                {error ? (
                  <small id={fieldId + "-error"} className="field-error">
                    {error}
                  </small>
                ) : (
                  f.hint && (
                    <small id={fieldId + "-hint"} className="field-hint">
                      {f.hint}
                    </small>
                  )
                )}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="form-footer">
        {note && <p>{note}</p>}
        <Submit label={label} />
      </div>
    </form>
  );
}

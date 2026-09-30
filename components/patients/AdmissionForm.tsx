"use client";
import { useId, useRef, useState } from "react";
import { ActionForm } from "@/components/shared/ActionForm";
import { Modal } from "@/components/shared/Modal";
import { FeedbackError, submit } from "@/services/api";
import type { ActionInput } from "@/shared/validation";
import type { Bed } from "@/shared/types";

export function AdmissionForm({
  beds,
  onDone,
}: {
  beds: Bed[];
  onDone: () => void;
}) {
  const free = beds.filter((b) => !b.occupied);
  const [readmission, setReadmission] = useState<ActionInput<"admit"> | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const noteId = useId();
  const close = () => {
    if (!lock.current) setReadmission(null);
  };

  return (
    <>
      <ActionForm
        action="admit"
        label="تسجيل المريض"
        fields={[
          {
            name: "name",
            label: "اسم المريض الكامل",
            wide: true,
            hint: "اسم نصي دون أرقام",
          },
          { name: "phone", label: "رقم الهاتف", dir: "ltr", optional: true },
          { name: "dob", label: "تاريخ الميلاد", type: "date" },
          {
            name: "sex",
            optional: true,
            label: "الجنس",
            type: "select",
            options: [
              { value: "female", label: "أنثى" },
              { value: "male", label: "ذكر" },
            ],
          },
          {
            name: "bedId",
            label: "اختر السرير",
            type: "bed-grid",
            wide: true,
            options: free.map((bed) => ({
              value: bed.id,
              label: bed.name,
              description: `${bed.department} · ${bed.ward}`,
            })),
          },
        ]}
        build={(values) => {
          if (values.bedId && !free.some((bed) => bed.id === values.bedId)) {
            throw new FeedbackError("اختر سريرًا متاحًا", {
              bedId: "السرير المحدد لم يعد متاحًا",
            });
          }
          return values;
        }}
        onError={(failure, input) => {
          if (
            !(failure instanceof FeedbackError) ||
            failure.code !== "READMISSION_REQUIRED"
          )
            return false;
          setNote("");
          setError("");
          setReadmission(input as ActionInput<"admit">);
          return true;
        }}
        note="الاسم وتاريخ الميلاد واختيار السرير مطلوبة. يُحجز السرير بعد التحقق من توفره."
        onSuccess={onDone}
      />
      {readmission && (
        <Modal
          title="تأكيد إعادة القبول"
          subtitle="يوجد ملف سابق بنفس الاسم وتاريخ الميلاد. تحقق من الهوية قبل المتابعة."
          close={close}
        >
          <p>
            {readmission.name} · <span dir="ltr">{readmission.dob}</span>
          </p>
          <form
            noValidate
            aria-busy={busy}
            onSubmit={async (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (lock.current) return;
              if (note.trim().length < 5) {
                setError(
                  "أدخل ملاحظة توضح سبب إعادة القبول من 5 محارف على الأقل",
                );
                document.getElementById(noteId)?.focus();
                return;
              }
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                await submit("admit", {
                  ...readmission,
                  duplicateReason: note.trim(),
                });
                setReadmission(null);
                onDone();
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "تعذر تأكيد إعادة القبول",
                );
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            {error && (
              <p role="alert" className="feedback error">
                {error}
              </p>
            )}
            <label className="field" htmlFor={noteId}>
              <span className="field-label">ملاحظة إعادة القبول</span>
              <textarea
                id={noteId}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={300}
                required
                disabled={busy}
              />
            </label>
            <div className="form-footer">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={close}
              >
                إلغاء
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? "جارٍ الحفظ…" : "تأكيد إعادة القبول"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

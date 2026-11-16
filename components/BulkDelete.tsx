"use client";

/**
 * Bulk delete for the lists (ADMIN only). The row checkboxes live in the table with the attribute
 * form="<formId>" and name="ids"; <BulkDeleteBar> is the form that sends them, <SelectAllBox> ticks them all.
 */
const boxes = (formId: string) => Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"]`));

export function BulkDeleteBar({
  formId,
  action,
  what,
}: {
  formId: string;
  action: (formData: FormData) => void | Promise<void>;
  /** e.g. "trip requests" */
  what: string;
}) {
  return (
    <form
      id={formId}
      action={action}
      onSubmit={(e) => {
        const n = boxes(formId).filter((b) => b.checked).length;
        if (n === 0) {
          e.preventDefault();
          window.alert(`Tick the ${what} you want to delete.`);
          return;
        }
        if (!window.confirm(`Delete ${n} ${what} for good? This cannot be undone.`)) e.preventDefault();
      }}
      style={{ marginBottom: 10 }}
    >
      <button type="submit" className="ghost danger">
        Delete selected
      </button>
    </form>
  );
}

export function SelectAllBox({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(e) => boxes(formId).forEach((b) => (b.checked = e.target.checked))}
    />
  );
}

"use client";

/**
 * A <form> that asks for confirmation before submitting its server action.
 * Use it for every action that deletes or revokes something.
 */
export default function ConfirmForm({
  action,
  message,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

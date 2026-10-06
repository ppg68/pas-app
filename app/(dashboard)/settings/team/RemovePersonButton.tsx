"use client";

import { removePerson } from "./actions";

export default function RemovePersonButton({ userId, name }: { userId: string; name: string }) {
  return (
    <form
      action={removePerson.bind(null, userId)}
      onSubmit={(e) => {
        if (!window.confirm(`Remove ${name} from PAS?

Their roles are deleted and they disappear from this list. Their login stays valid for the other apps; if they sign in to PAS again they start with no roles.`)) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="ghost danger" title="Remove this person from PAS">
        Remove
      </button>
    </form>
  );
}

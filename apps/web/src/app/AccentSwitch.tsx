import { useState } from "react";
import { ACCENTS, applyAccent, readAccent, type AccentId } from "./accent";

/** Five squares that recolour the whole HUD. */
export function AccentSwitch() {
  const [cur, setCur] = useState<AccentId>(readAccent);
  return (
    <div className="accent-switch" role="group" aria-label="HUD accent colour" translate="no">
      <span className="accent-switch__label">HUD</span>
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          title={a.label}
          aria-label={`${a.label} accent`}
          aria-pressed={cur === a.id}
          style={{ background: a.color }}
          onClick={() => {
            applyAccent(a.id);
            setCur(a.id);
          }}
        />
      ))}
    </div>
  );
}

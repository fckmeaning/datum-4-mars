/** Greedy label declutter: higher priority labels stay, any label overlapping a kept one is hidden. */

export interface LabelBox {
  id: string;
  /** Anchor point on screen (the label sits above it). */
  x: number;
  y: number;
  /** Estimated size in px. */
  w: number;
  h: number;
  priority: number;
  visible: boolean;
}

/** Rough label width from its text: about 6.2 px per character plus padding and the badge. */
export function estimateLabelWidth(name: string, badge: string): number {
  return 22 + name.length * 6.2 + 10 + badge.length * 5.6;
}

function rect(b: LabelBox) {
  // the label is translated (-50%, -125%) from the anchor
  const left = b.x - b.w / 2;
  const top = b.y - b.h * 1.25;
  return { left, top, right: left + b.w, bottom: top + b.h };
}

export function hideOverlapping(items: LabelBox[]): Set<string> {
  const hidden = new Set<string>();
  const kept: ReturnType<typeof rect>[] = [];
  const order = [...items].filter((i) => i.visible).sort((a, b) => b.priority - a.priority);
  for (const it of order) {
    const r = rect(it);
    const clash = kept.some((k) => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top);
    if (clash) hidden.add(it.id);
    else kept.push(r);
  }
  return hidden;
}

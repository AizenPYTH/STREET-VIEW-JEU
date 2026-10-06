export type TimerHandle = { id: number };

/** Abstraction over wall clock + timers so the engine can be tested deterministically. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export class SystemClock implements Clock {
  private readonly timers = new Map<number, NodeJS.Timeout>();
  private nextId = 1;

  now(): number {
    return Date.now();
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.nextId++;
    const t = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, Math.max(0, ms));
    this.timers.set(id, t);
    return { id };
  }

  clearTimeout(handle: TimerHandle): void {
    const t = this.timers.get(handle.id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(handle.id);
    }
  }
}

/** Manual clock for tests: time only moves when `advance()` is called. */
export class FakeClock implements Clock {
  private current: number;
  private nextId = 1;
  private readonly pending = new Map<number, { at: number; fn: () => void; seq: number }>();
  private seq = 0;

  constructor(start = 1_700_000_000_000) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.nextId++;
    this.pending.set(id, { at: this.current + Math.max(0, ms), fn, seq: this.seq++ });
    return { id };
  }

  clearTimeout(handle: TimerHandle): void {
    this.pending.delete(handle.id);
  }

  /** Moves time forward, firing due timers in chronological order (timers may schedule new timers). */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      let next: { id: number; at: number; fn: () => void; seq: number } | null = null;
      for (const [id, t] of this.pending) {
        if (t.at <= target && (next === null || t.at < next.at || (t.at === next.at && t.seq < next.seq))) {
          next = { id, ...t };
        }
      }
      if (!next) break;
      this.pending.delete(next.id);
      this.current = Math.max(this.current, next.at);
      next.fn();
    }
    this.current = target;
  }

  pendingCount(): number {
    return this.pending.size;
  }
}

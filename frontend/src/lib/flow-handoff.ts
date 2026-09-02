/** Snapshot del wizard en sessionStorage (mismo origen /formulario y /emision). */
export const FLOW_HANDOFF_KEY = 'exelixi_bridge_state';

export function persistFlowHandoff(state: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(FLOW_HANDOFF_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function readFlowHandoff(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(FLOW_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

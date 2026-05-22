// Tipos globales del bridge entre módulos.
export {};
declare global {
  interface Window {
    __bridgeAdvance?: (extra?: Record<string, unknown>) => Promise<void>;
    __bridge?: {
      active: boolean;
      sid: string | null;
      order: number | null;
      hydrate: () => Promise<void>;
      save: (extra?: Record<string, unknown>) => Promise<void>;
      advance: (extra?: Record<string, unknown>) => Promise<{ finished: boolean; nextUrl?: string }>;
    };
  }
}
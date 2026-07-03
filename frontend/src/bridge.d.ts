// Tipos globales del bridge entre módulos.
export {};
declare global {
  interface Window {
    __bridgeAdvance?: (extra?: Record<string, unknown>) => Promise<void>;
    __bridgeNavigateStep?: (targetStep: number) => Promise<boolean>;
    __bridge?: {
      active: boolean;
      sid: string | null;
      order: number | null;
      ready: Promise<void>;
      hydrate: () => Promise<void>;
      save: (extra?: Record<string, unknown>) => Promise<void>;
      advance: (extra?: Record<string, unknown>) => Promise<{ finished: boolean; nextUrl?: string }>;
      navigateToStep: (targetStep: number) => Promise<boolean>;
    };
  }
}

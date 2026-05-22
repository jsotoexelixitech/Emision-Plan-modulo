/**
 * Wrapper fino sobre `sonner` que mantiene la misma API que el store anterior.
 * Todos los toast.success / toast.error / toast.warning / toast.info
 * del resto del código siguen funcionando sin cambios.
 */
import { toast as sonnerToast } from 'sonner';

const DEFAULT_DURATION = 4500;

export const toast = {
  success: (title: string, description?: string, duration = DEFAULT_DURATION) =>
    sonnerToast.success(title, { description, duration }),

  error: (title: string, description?: string, duration = DEFAULT_DURATION) =>
    sonnerToast.error(title, { description, duration }),

  warning: (title: string, description?: string, duration = DEFAULT_DURATION) =>
    sonnerToast.warning(title, { description, duration }),

  info: (title: string, description?: string, duration = DEFAULT_DURATION) =>
    sonnerToast.info(title, { description, duration }),

  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};

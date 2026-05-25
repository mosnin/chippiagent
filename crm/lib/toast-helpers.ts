import { toast } from 'sonner';

type ToastId = string | number;

export function toastLoading(message: string, id?: string): ToastId {
  return toast.loading(message, { id });
}

export function toastSuccess(message: string, id?: ToastId): void {
  if (id) {
    toast.success(message, { id, duration: 3000 });
  } else {
    toast.success(message, { duration: 3000 });
  }
}

export function toastError(message: string, id?: ToastId): void {
  if (id) {
    toast.error(message, { id, duration: 4000 });
  } else {
    toast.error(message, { duration: 4000 });
  }
}

export function toastCopied(label = 'Copied to clipboard'): void {
  toast.success(label, { duration: 2000 });
}

export function toastDismiss(id: ToastId): void {
  toast.dismiss(id);
}

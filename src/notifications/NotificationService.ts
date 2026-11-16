import type { UserRole } from '../types/report.ts';
import type {
  AlertDialogOptions,
  ApprovalDialogPayload,
  ConfirmDialogOptions,
  MissingDataDialogOptions,
  NotificationCategory,
  NotificationHistoryItem,
  NotificationNavigationTarget,
  NotifyOptions,
  ToastItem,
  UnsavedChangesChoice,
  UnsavedChangesDialogOptions,
} from './types.ts';

const HISTORY_STORAGE_KEY = 'saaed_fm_notification_history_v1';
const MAX_HISTORY_ITEMS = 60;
const MAX_VISIBLE_TOASTS = 4;
const DEDUPE_WINDOW_MS = 1800;

export type ActiveModalState =
  | {
      kind: 'confirm';
      id: string;
      options: ConfirmDialogOptions;
      resolve: (confirmed: boolean) => void;
    }
  | {
      kind: 'alert';
      id: string;
      options: AlertDialogOptions;
      resolve: () => void;
    }
  | {
      kind: 'approval';
      id: string;
      payload: ApprovalDialogPayload;
      resolve: (approved: boolean) => void;
    }
  | {
      kind: 'unsaved';
      id: string;
      options: UnsavedChangesDialogOptions;
      resolve: (choice: UnsavedChangesChoice) => void;
    }
  | {
      kind: 'missing_data';
      id: string;
      options: MissingDataDialogOptions;
      resolve: () => void;
    };

export interface NotificationStoreSnapshot {
  toasts: ToastItem[];
  history: NotificationHistoryItem[];
  activeModal: ActiveModalState | null;
}

type Listener = (snapshot: NotificationStoreSnapshot) => void;

function loadPersistedHistory(): NotificationHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.createdAt === 'string'
      )
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function savePersistedHistory(items: NotificationHistoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // Ignore storage quota errors safely
  }
}

function getDefaultDurationMs(type: NotificationCategory): number {
  switch (type) {
    case 'success':
      return 4200;
    case 'info':
      return 5500;
    case 'warning':
      return 6500;
    case 'error':
      return 0; // Persistent until dismissed by default
  }
}

class NotificationServiceImpl {
  private toasts: ToastItem[] = [];
  private history: NotificationHistoryItem[] = loadPersistedHistory();
  private modalQueue: ActiveModalState[] = [];
  private listeners = new Set<Listener>();
  private recentEventMap = new Map<string, number>();
  private toastTimers = new Map<string, number>();
  private navigationHandler: ((target: NotificationNavigationTarget) => void) | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): NotificationStoreSnapshot {
    return {
      toasts: this.toasts,
      history: this.history,
      activeModal: this.modalQueue[0] ?? null,
    };
  }

  private emit() {
    const snap = this.getSnapshot();
    this.listeners.forEach((l) => l(snap));
  }

  setNavigationHandler(handler: ((target: NotificationNavigationTarget) => void) | null) {
    this.navigationHandler = handler;
  }

  navigateTo(target?: NotificationNavigationTarget) {
    if (!target) return;
    if (this.navigationHandler) {
      this.navigationHandler(target);
      return;
    }
    if (target.sectionId && typeof document !== 'undefined') {
      const el = document.getElementById(target.sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  notify(options: NotifyOptions): string | null {
    const nowMs = Date.now();
    const dedupeKey =
      options.dedupeKey || `${options.type}:${options.title}:${options.message || ''}`;

    const lastSeen = this.recentEventMap.get(dedupeKey);
    if (lastSeen && nowMs - lastSeen < DEDUPE_WINDOW_MS) {
      return null;
    }
    this.recentEventMap.set(dedupeKey, nowMs);

    // Clean stale dedupe keys occasionally
    if (this.recentEventMap.size > 80) {
      for (const [k, ts] of this.recentEventMap.entries()) {
        if (nowMs - ts > DEDUPE_WINDOW_MS * 3) {
          this.recentEventMap.delete(k);
        }
      }
    }

    const id = `ntf_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date().toISOString();
    const defaultDuration = getDefaultDurationMs(options.type);
    const persistent = options.persistent ?? (options.type === 'error' && options.durationMs === undefined);
    const durationMs = persistent ? 0 : (options.durationMs ?? defaultDuration);

    const toast: ToastItem = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      context: options.context,
      createdAt,
      durationMs,
      persistent,
      action: options.action,
      details: options.details,
      errorCode: options.errorCode,
      target: options.target,
    };

    // Replace existing toast with same dedupeKey or prepend/stack up to cap
    this.toasts = [...this.toasts.slice(-(MAX_VISIBLE_TOASTS - 1)), toast];

    if (durationMs > 0 && typeof window !== 'undefined') {
      const timerId = window.setTimeout(() => {
        this.dismissToast(id);
      }, durationMs);
      this.toastTimers.set(id, timerId);
    }

    const shouldRecord =
      options.recordInHistory ?? (options.type === 'error' || options.type === 'warning');

    if (shouldRecord) {
      const histItem: NotificationHistoryItem = {
        id,
        type: options.type,
        title: options.title,
        message: options.message,
        context: options.context || (options.type === 'error' ? 'network' : 'saved'),
        createdAt,
        read: false,
        reportNumber: options.reportNumber,
        errorCode: options.errorCode,
        target: options.target,
        allowedRoles: options.allowedRoles,
      };
      this.history = [histItem, ...this.history].slice(0, MAX_HISTORY_ITEMS);
      savePersistedHistory(this.history);
    }

    this.emit();
    return id;
  }

  success(title: string, message?: string, extra?: Partial<NotifyOptions>) {
    return this.notify({ type: 'success', title, message, ...extra });
  }

  error(title: string, message?: string, extra?: Partial<NotifyOptions>) {
    return this.notify({ type: 'error', title, message, ...extra });
  }

  warning(title: string, message?: string, extra?: Partial<NotifyOptions>) {
    return this.notify({ type: 'warning', title, message, ...extra });
  }

  info(title: string, message?: string, extra?: Partial<NotifyOptions>) {
    return this.notify({ type: 'info', title, message, ...extra });
  }

  dismissToast(id: string) {
    const timer = this.toastTimers.get(id);
    if (timer !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(timer);
      this.toastTimers.delete(id);
    }
    const next = this.toasts.filter((t) => t.id !== id);
    if (next.length !== this.toasts.length) {
      this.toasts = next;
      this.emit();
    }
  }

  clearToasts() {
    this.toastTimers.forEach((timerId) => {
      if (typeof window !== 'undefined') window.clearTimeout(timerId);
    });
    this.toastTimers.clear();
    this.toasts = [];
    this.emit();
  }

  markHistoryAsRead(id: string) {
    let changed = false;
    this.history = this.history.map((item) => {
      if (item.id === id && !item.read) {
        changed = true;
        return { ...item, read: true };
      }
      return item;
    });
    if (changed) {
      savePersistedHistory(this.history);
      this.emit();
    }
  }

  markAllHistoryAsRead(role?: UserRole | null) {
    let changed = false;
    this.history = this.history.map((item) => {
      if (!item.allowedRoles || (role && item.allowedRoles.includes(role))) {
        if (!item.read) {
          changed = true;
          return { ...item, read: true };
        }
      }
      return item;
    });
    if (changed) {
      savePersistedHistory(this.history);
      this.emit();
    }
  }

  clearHistory() {
    this.history = [];
    savePersistedHistory([]);
    this.emit();
  }

  confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const id = `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.modalQueue = [
        ...this.modalQueue,
        {
          kind: 'confirm',
          id,
          options,
          resolve: (confirmed: boolean) => {
            this.removeModal(id);
            resolve(confirmed);
          },
        },
      ];
      this.emit();
    });
  }

  alertDialog(options: AlertDialogOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      const id = `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.modalQueue = [
        ...this.modalQueue,
        {
          kind: 'alert',
          id,
          options,
          resolve: () => {
            this.removeModal(id);
            resolve();
          },
        },
      ];
      this.emit();
    });
  }

  approvalDialog(payload: ApprovalDialogPayload): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const id = `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.modalQueue = [
        ...this.modalQueue,
        {
          kind: 'approval',
          id,
          payload,
          resolve: (approved: boolean) => {
            this.removeModal(id);
            resolve(approved);
          },
        },
      ];
      this.emit();
    });
  }

  unsavedChangesDialog(options: UnsavedChangesDialogOptions = {}): Promise<UnsavedChangesChoice> {
    return new Promise<UnsavedChangesChoice>((resolve) => {
      const id = `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.modalQueue = [
        ...this.modalQueue,
        {
          kind: 'unsaved',
          id,
          options,
          resolve: (choice: UnsavedChangesChoice) => {
            this.removeModal(id);
            resolve(choice);
          },
        },
      ];
      this.emit();
    });
  }

  missingDataDialog(options: MissingDataDialogOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      const id = `dlg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.modalQueue = [
        ...this.modalQueue,
        {
          kind: 'missing_data',
          id,
          options,
          resolve: () => {
            this.removeModal(id);
            resolve();
          },
        },
      ];
      this.emit();
    });
  }

  private removeModal(id: string) {
    this.modalQueue = this.modalQueue.filter((m) => m.id !== id);
    this.emit();
  }
}

export const notificationService = new NotificationServiceImpl();

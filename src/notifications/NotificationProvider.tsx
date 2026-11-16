import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  notificationService,
  type NotificationStoreSnapshot,
} from './NotificationService.ts';
import { ToastNotificationViewport } from './ToastNotification.tsx';
import { ModalDialogHost } from './NotificationDialogs.tsx';
import type {
  AlertDialogOptions,
  ApprovalDialogPayload,
  ConfirmDialogOptions,
  MissingDataDialogOptions,
  NotificationNavigationTarget,
  NotifyOptions,
  UnsavedChangesChoice,
  UnsavedChangesDialogOptions,
} from './types.ts';
import type { UserRole } from '../types/report.ts';

interface NotificationContextValue {
  snapshot: NotificationStoreSnapshot;
  notify: (options: NotifyOptions) => string | null;
  notifySuccess: (title: string, message?: string, extra?: Partial<NotifyOptions>) => string | null;
  notifyError: (title: string, message?: string, extra?: Partial<NotifyOptions>) => string | null;
  notifyWarning: (title: string, message?: string, extra?: Partial<NotifyOptions>) => string | null;
  notifyInfo: (title: string, message?: string, extra?: Partial<NotifyOptions>) => string | null;
  dismissToast: (id: string) => void;
  confirmDialog: (options: ConfirmDialogOptions) => Promise<boolean>;
  alertDialog: (options: AlertDialogOptions) => Promise<void>;
  approvalDialog: (payload: ApprovalDialogPayload) => Promise<boolean>;
  unsavedChangesDialog: (options?: UnsavedChangesDialogOptions) => Promise<UnsavedChangesChoice>;
  missingDataDialog: (options: MissingDataDialogOptions) => Promise<void>;
  markHistoryAsRead: (id: string) => void;
  markAllHistoryAsRead: (role?: UserRole | null) => void;
  clearHistory: () => void;
  setNavigationHandler: (handler: ((target: NotificationNavigationTarget) => void) | null) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<NotificationStoreSnapshot>(() =>
    notificationService.getSnapshot()
  );

  useEffect(() => {
    return notificationService.subscribe(setSnapshot);
  }, []);

  const value: NotificationContextValue = {
    snapshot,
    notify: (opts) => notificationService.notify(opts),
    notifySuccess: (title, message, extra) => notificationService.success(title, message, extra),
    notifyError: (title, message, extra) => notificationService.error(title, message, extra),
    notifyWarning: (title, message, extra) => notificationService.warning(title, message, extra),
    notifyInfo: (title, message, extra) => notificationService.info(title, message, extra),
    dismissToast: (id) => notificationService.dismissToast(id),
    confirmDialog: (opts) => notificationService.confirmDialog(opts),
    alertDialog: (opts) => notificationService.alertDialog(opts),
    approvalDialog: (payload) => notificationService.approvalDialog(payload),
    unsavedChangesDialog: (opts) => notificationService.unsavedChangesDialog(opts),
    missingDataDialog: (opts) => notificationService.missingDataDialog(opts),
    markHistoryAsRead: (id) => notificationService.markHistoryAsRead(id),
    markAllHistoryAsRead: (role) => notificationService.markAllHistoryAsRead(role),
    clearHistory: () => notificationService.clearHistory(),
    setNavigationHandler: (handler) => notificationService.setNavigationHandler(handler),
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastNotificationViewport
        toasts={snapshot.toasts}
        onDismiss={(id) => notificationService.dismissToast(id)}
        onNavigate={(target) => notificationService.navigateTo(target)}
      />
      <ModalDialogHost activeModal={snapshot.activeModal} />
    </NotificationContext.Provider>
  );
};

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return ctx;
}

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { AuthContext } from './AuthContext';

export const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { token, role } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const seenRef = useRef(new Set());

  const fetchNotifications = async () => {
    if (!token || role !== 'USER') return;

    try {
      const res = await api.get('/user/notifications');
      const next = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      const available = next.filter((notification) => notification?._id);
      setNotifications(available);

      const currentSeen = new Set(seenRef.current);
      const unseen = available.filter((notification) => !currentSeen.has(notification._id));

      available.forEach((notification) => currentSeen.add(notification._id));
      seenRef.current = currentSeen;

      if (unseen.length > 0) {
        const latest = unseen.reduce((latestCandidate, notification) => {
          const latestTime = new Date(latestCandidate.createdAt || 0).getTime();
          const candidateTime = new Date(notification.createdAt || 0).getTime();
          return candidateTime > latestTime ? notification : latestCandidate;
        }, unseen[0]);

        setToast({
          id: latest._id,
          title: latest.title || latest.type || 'TrustFlow Notification',
          message: latest.message || 'You have a new notification.',
          severity: (latest.severity || 'INFO').toLowerCase(),
        });
      }
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error('Notification polling failed:', error);
      }
    }
  };

  useEffect(() => {
    if (!token || role !== 'USER') {
      setNotifications([]);
      setToast(null);
      return undefined;
    }

    fetchNotifications();
    const timer = window.setInterval(fetchNotifications, 15000);
    return () => window.clearInterval(timer);
  }, [token, role]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const dismissToast = () => setToast(null);

  const value = useMemo(() => ({
    notifications,
    fetchNotifications,
    toast,
    dismissToast,
  }), [notifications, toast, token, role]);

  const toastClass = (() => {
    const severity = (toast?.severity || 'info').toLowerCase();
    if (severity === 'warning' || severity === 'warn') return 'warning';
    if (severity === 'critical' || severity === 'danger' || severity === 'error') return 'danger';
    if (severity === 'success') return 'success';
    return 'info';
  })();

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="notification-stack">
        {toast && (
          <div className={`notification-toast ${toastClass}`}>
            <div className="notification-toast-header">
              <span className="notification-toast-title">{toast.title}</span>
              <button type="button" className="notification-toast-close" aria-label="Dismiss notification" onClick={dismissToast}>×</button>
            </div>
            <div className="notification-toast-message">{toast.message}</div>
          </div>
        )}
      </div>
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    return { notifications: [], fetchNotifications: async () => {}, toast: null, dismissToast: () => {} };
  }
  return context;
};

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Actor, Snapshot } from '@/shared/types';
import { submit, clearPending } from '@/services/api';
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [setup, setSetup] = useState<Actor | null>(null),
    [loading, setLoading] = useState(true),
    [testLoginEnabled, setTestLoginEnabled] = useState(false),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [tab, setTab] = useState<'patients' | 'bills' | 'inventory' | 'manage'>('patients'),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('open'),
    [page, setPage] = useState(1);
  const generation = useRef(0),
    request = useRef<AbortController | null>(null);
  const clear = useCallback(() => {
    generation.current++;
    request.current?.abort();
    clearPending();
    setSnapshot(null);
    setSetup(null);
    setConnected(false);
    setLoading(false);
    setTab('patients');
    setSearch('');
    setPage(1);
  }, []);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(
        '/api/app?' + new URLSearchParams({ tab, q: search, page: String(page), status }),
        { cache: 'no-store', signal: controller.signal },
      );
      const data = await response.json();
      if (current !== generation.current) return;
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل البيانات');
      setError('');
      setTestLoginEnabled(data.testLoginEnabled === true);
      if (!data.actor) {
        clear();
        return;
      }
      if (data.setup) {
        setSetup(data.actor);
        setSnapshot(null);
      } else {
        setSetup(null);
        setSnapshot(data);
        if (data.actor.role === 'inventory' && tab !== 'inventory') {
          setTab('inventory');
          setPage(1);
          setSearch('');
        }
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'تعذر الاتصال بالخادم');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [tab, search, page, status, clear]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 200);
    return () => {
      clearTimeout(timer);
      request.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    const handler = () => clear();
    window.addEventListener('nour-session-expired', handler);
    return () => window.removeEventListener('nour-session-expired', handler);
  }, [clear]);
  const actorId = snapshot?.actor.id;
  useEffect(() => {
    if (!actorId) return;
    const stream = new EventSource('/api/events');
    let revision = -1;
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.onmessage = (e) => {
      setConnected(true);
      const next = Number(e.data);
      if (next !== revision) {
        revision = next;
        void refresh();
      }
    };
    const reconnect = () => void refresh();
    window.addEventListener('focus', reconnect);
    return () => {
      stream.close();
      window.removeEventListener('focus', reconnect);
    };
  }, [actorId, refresh]);
  useEffect(() => {
    if (!actorId) return;
    let last = Date.now(),
      sent = 0;
    const activity = () => {
      last = Date.now();
      if (last - sent > 60000) {
        sent = last;
        void submit('activity', {}).catch(() => undefined);
      }
    };
    const timer = setInterval(() => {
      if (Date.now() - last >= 300000) {
        clear();
        void submit('logout', {}).catch(() => undefined);
      }
    }, 5000);
    for (const name of ['pointerdown', 'keydown']) window.addEventListener(name, activity);
    return () => {
      clearInterval(timer);
      for (const name of ['pointerdown', 'keydown']) window.removeEventListener(name, activity);
    };
  }, [actorId, clear]);
  const logout = async () => {
    try {
      await submit('logout', {});
      clear();
    } catch {
      setError('تعذر تأكيد تسجيل الخروج. أعد المحاولة أو اقفل الجهاز');
    }
  };
  return {
    snapshot,
    testLoginEnabled,
    setup,
    loading,
    error,
    connected,
    tab,
    setTab: (v: typeof tab) => {
      setTab(v);
      setPage(1);
      setSearch('');
    },
    search,
    setSearch: (v: string) => {
      setSearch(v);
      setPage(1);
    },
    status,
    setStatus: (v: string) => {
      setStatus(v);
      setPage(1);
    },
    page,
    setPage,
    refresh,
    logout,
  };
}

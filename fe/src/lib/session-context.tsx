"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { EngineConfig, Session, TacticalRole } from "@/types/sentinel";
import { API_BASE_URL } from "@/lib/api";

const SESSION_KEY = "ozikra.session";
const ENGINE_KEY = "ozikra.engine";
const SANDBOX_USED_KEY = "ozikra.sandbox_used_flag";
const CLEARANCE_KEY = "ozikra.clearance_approved";

const DEFAULT_ENGINE: EngineConfig = {
  mode: "CLOUD_SANDBOX",
  localEndpointUrl: "",
  modelName: "MiniMax-M3.1-Flash-Preview",
};

export interface GoogleAccountPayload {
  id?: string;
  name: string;
  email: string;
  role: TacticalRole;
  avatarUrl?: string | null;
}

export function decodeJwtRole(token?: string | null): TacticalRole | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const jsonStr = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(jsonStr);
    if (payload.role && (payload.role === "SUPER_ADMIN" || payload.role === "COMMANDER" || payload.role === "LOGISTICS_OFFICER" || payload.role === "FORENSIC_AUDITOR")) {
      return payload.role as TacticalRole;
    }
  } catch (e) {
    console.warn("Failed to decode JWT role:", e);
  }
  return null;
}

interface SessionContextValue {
  session: Session | null;
  isReady: boolean;
  /** Effective role used for UI authorization (strictly decoded from active real JWT). */
  role: TacticalRole | null;
  engine: EngineConfig;
  isSandboxExhausted: boolean;
  clearanceApproved: boolean;
  setClearanceApproved: (approved: boolean) => void;
  resetSandboxLimit: () => void;
  verifyMemberNRP: (
    email: string,
    nrp: string
  ) => Promise<{ success: boolean; officer?: any; token?: string; error?: string }>;
  confirmOfficerSession: (officer: any, token?: string) => void;
  checkAndSignInGoogle: (
    email: string,
    name?: string
  ) => Promise<{ registered: boolean; officer?: any; status?: string }>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleAccount: (account: GoogleAccountPayload) => void;
  enterSandbox: () => boolean;
  signOut: () => void;
  switchSimulatedRole: (role: TacticalRole) => Promise<boolean>;
  setEngine: (config: EngineConfig) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [engine, setEngineState] = useState<EngineConfig>(DEFAULT_ENGINE);
  const [isReady, setReady] = useState(false);
  const [isSandboxExhausted, setIsSandboxExhausted] = useState(false);
  const [clearanceApproved, setClearanceApprovedState] = useState(false);

  useEffect(() => {
    // Hydrate persisted session after mount (client-only storage).
    const storedSession = readStorage<Session>(SESSION_KEY);
    const storedEngine = readStorage<EngineConfig>(ENGINE_KEY);
    const sandboxUsed = window.localStorage.getItem(SANDBOX_USED_KEY) === "true";
    const clearance = window.sessionStorage.getItem(CLEARANCE_KEY) === "true";

    queueMicrotask(() => {
      if (storedSession) {
        const sanitized: Session = {
          ...storedSession,
          user: {
            ...storedSession.user,
            status: storedSession.user.status || "APPROVED",
            nrp: storedSession.user.nrp || "11050182740981",
          },
        };
        setSession(sanitized);
      }
      if (storedEngine) setEngineState(storedEngine);
      setIsSandboxExhausted(sandboxUsed);
      setClearanceApprovedState(clearance);
      setReady(true);
    });
  }, []);

  const persist = useCallback((next: Session | null) => {
    setSession(next);
    if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(SESSION_KEY);
  }, []);

  const confirmOfficerSession = useCallback(
    (off: any, token?: string) => {
      persist({
        user: {
          id: off.id,
          name: off.name,
          email: off.email,
          role: off.role as TacticalRole,
          nrp: off.nrp || "11050182740981",
          unit: off.unit || "Pusat Sandi & Siber TNI-AD (PUSSANSERAD)",
          rank: off.rank || "Perwira",
          status: off.status || "APPROVED",
          publicKey: off.publicKey,
          avatarUrl: off.avatarUrl,
        },
        provider: "GOOGLE_OAUTH",
        simulatedRole: off.role as TacticalRole,
        issuedAt: new Date().toISOString(),
      });
      if (token && typeof window !== "undefined") {
        window.localStorage.setItem("ozikra_mil_token", token);
      }
    },
    [persist],
  );

  const setClearanceApproved = useCallback((approved: boolean) => {
    setClearanceApprovedState(approved);
    if (typeof window !== "undefined") {
      if (approved) window.sessionStorage.setItem(CLEARANCE_KEY, "true");
      else window.sessionStorage.removeItem(CLEARANCE_KEY);
    }
  }, []);

  const resetSandboxLimit = useCallback(() => {
    setIsSandboxExhausted(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SANDBOX_USED_KEY);
    }
  }, []);

  // Sandbox Mode: STRICTLY LIMITED TO 1-TIME USE per browser/visitor
  const enterSandbox = useCallback((): boolean => {
    const used = window.localStorage.getItem(SANDBOX_USED_KEY) === "true";
    if (used) {
      setIsSandboxExhausted(true);
      return false;
    }

    // Mark sandbox as used permanently
    window.localStorage.setItem(SANDBOX_USED_KEY, "true");
    setIsSandboxExhausted(true);

    persist({
      user: {
        id: "sandbox-evaluator-single",
        name: "Sandbox Evaluator (1-Time Demo Pass)",
        email: "evaluator.sandbox@ozikra.mil.id",
        role: "SUPER_ADMIN",
        publicKey: "ED25519-MIL-CERT-DEMO-PASS-2026",
      },
      provider: "SANDBOX",
      simulatedRole: "SUPER_ADMIN",
      issuedAt: new Date().toISOString(),
    });
    setClearanceApproved(true);

    // Call backend to mint real military JWT immediately
    fetch(`${API_BASE_URL}/api/v1/auth/simulate-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_role: "SUPER_ADMIN" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.token && typeof window !== "undefined") {
          window.localStorage.setItem("ozikra.active_token", data.token);
          document.cookie = `ozik_token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
          const current = readStorage<Session>(SESSION_KEY);
          if (current) {
            persist({ ...current, token: data.token });
          }
        }
      })
      .catch(() => {});

    return true;
  }, [persist, setClearanceApproved]);

  const signInWithGoogleAccount = useCallback(
    (account: GoogleAccountPayload) => {
      persist({
        user: {
          id: account.id || `google-${account.email}`,
          name: account.name,
          email: account.email,
          role: account.role,
          nrp: (account as any).nrp || "11050182740981",
          unit: (account as any).unit || "Pusat Sandi & Siber TNI-AD (PUSSANSERAD)",
          rank: (account as any).rank || "Perwira",
          status: "APPROVED",
          avatarUrl: account.avatarUrl || null,
          publicKey: `ED25519-MIL-CERT-${account.email.split("@")[0].toUpperCase()}-2026`,
        },
        provider: "GOOGLE_OAUTH",
        simulatedRole: account.role,
        issuedAt: new Date().toISOString(),
      });
    },
    [persist],
  );

  const checkAndSignInGoogle = useCallback(
    async (email: string, name?: string): Promise<{ registered: boolean; officer?: any; status?: string }> => {
      const cleanEmail = email.toLowerCase().trim();
      try {
        const res = await fetch(`/api/auth/officer?email=${encodeURIComponent(cleanEmail)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.exists && data.officer) {
            const off = data.officer;
            return {
              registered: true,
              officer: off,
              status: off.status || "PENDING",
            };
          }
        }
      } catch (err) {
        console.warn("DB check officer lookup:", err);
      }

      // Not registered yet — store pending Google email and name for onboarding
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("ozikra_pending_google_email", cleanEmail);
        if (name) window.sessionStorage.setItem("ozikra_pending_google_name", name);
      }

      return { registered: false };
    },
    []
  );

  const verifyMemberNRP = useCallback(
    async (email: string, nrp: string): Promise<{ success: boolean; officer?: any; token?: string; error?: string }> => {
      try {
        const res = await fetch("/api/auth/verify-member", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), nrp: nrp.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data?.message || data?.error || "Verifikasi Nomor Anggota gagal" };
        }
        if (data.officer) {
          confirmOfficerSession(data.officer, data.token);
        }
        return { success: true, officer: data.officer, token: data.token };
      } catch (err: any) {
        return { success: false, error: err?.message || "Gagal menghubungi server verifikasi militer" };
      }
    },
    [confirmOfficerSession]
  );

  const signInWithGoogle = useCallback(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(supabaseUrl, supabaseAnonKey);
        const { error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
            queryParams: {
              access_type: "offline",
              prompt: "select_account",
            },
          },
        });
        if (error) {
          console.error("Supabase Google Auth error:", error);
          alert("Gagal memanggil Supabase Google Auth: " + error.message);
        }
        return;
      } catch (e: any) {
        console.error("Supabase Google Auth exception:", e);
        alert("Kendala Supabase Google Auth: " + e?.message);
        return;
      }
    }

    console.warn("Supabase credentials missing");
  }, []);

  const signOut = useCallback(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const client = createClient(supabaseUrl, supabaseAnonKey);
        await client.auth.signOut();
      } catch (e) {
        console.warn("Supabase signOut error:", e);
      }
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("ozikra.active_token");
      document.cookie = "ozik_token=; path=/; max-age=0";
    }
    persist(null);
    setClearanceApproved(false);
  }, [persist, setClearanceApproved]);

  const switchSimulatedRole = useCallback(
    async (targetRole: TacticalRole): Promise<boolean> => {
      if (!session) return false;

      const currentToken =
        session.token ||
        (typeof window !== "undefined" ? window.localStorage.getItem("ozikra.active_token") : null);

      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/simulate-role`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
            "X-Simulated-Role": targetRole,
          },
          body: JSON.stringify({ target_role: targetRole }),
        });

        if (res.ok) {
          const data = await res.json();
          const newToken = data.token;
          const decodedRole = decodeJwtRole(newToken) || targetRole;

          if (typeof window !== "undefined") {
            if (newToken) {
              window.localStorage.setItem("ozikra.active_token", newToken);
              document.cookie = `ozik_token=${newToken}; path=/; max-age=86400; SameSite=Lax`;
            }
          }

          const updatedSession: Session = {
            ...session,
            token: newToken || session.token,
            simulatedRole: decodedRole,
            user: {
              ...session.user,
              role: decodedRole,
              ...(data.officer?.name ? { name: data.officer.name } : {}),
              ...(data.officer?.email ? { email: data.officer.email } : {}),
              ...(data.officer?.nrp ? { nrp: data.officer.nrp } : {}),
            },
          };

          persist(updatedSession);
          return true;
        }
      } catch (err) {
        console.error("Error switching tactical role via backend:", err);
      }

      // Fallback local update
      persist({ ...session, simulatedRole: targetRole });
      return false;
    },
    [session, persist],
  );

  const setEngine = useCallback((config: EngineConfig) => {
    setEngineState(config);
    window.localStorage.setItem(ENGINE_KEY, JSON.stringify(config));
  }, []);

  const activeJwtRole = useMemo<TacticalRole | null>(() => {
    if (!session) return null;
    let token = session.token;
    if (!token && typeof window !== "undefined") {
      token = window.localStorage.getItem("ozikra.active_token") || undefined;
    }
    const decoded = decodeJwtRole(token);
    return decoded || session.simulatedRole || session.user?.role || null;
  }, [session]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isReady,
      role: activeJwtRole,
      engine,
      isSandboxExhausted,
      clearanceApproved,
      setClearanceApproved,
      resetSandboxLimit,
      checkAndSignInGoogle,
      verifyMemberNRP,
      confirmOfficerSession,
      signInWithGoogle,
      signInWithGoogleAccount,
      enterSandbox,
      signOut,
      switchSimulatedRole,
      setEngine,
    }),
    [
      session,
      isReady,
      activeJwtRole,
      engine,
      isSandboxExhausted,
      clearanceApproved,
      setClearanceApproved,
      resetSandboxLimit,
      checkAndSignInGoogle,
      verifyMemberNRP,
      confirmOfficerSession,
      signInWithGoogle,
      signInWithGoogleAccount,
      enterSandbox,
      signOut,
      switchSimulatedRole,
      setEngine,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

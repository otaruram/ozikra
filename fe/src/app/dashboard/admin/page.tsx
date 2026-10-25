"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { RoleGate } from "@/components/shell/role-gate";
import {
  Button,
  cn,
  DataTable,
  ErrorLine,
  Eyebrow,
  Field,
  Input,
  Mono,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  Select,
  Tag,
  usePagination,
  type Column,
} from "@/components/ui";
import { useAction, useAsyncResource } from "@/hooks/use-async";
import { fetchOfficers, onSaveEngineConfig, onUpdateUserRole } from "@/lib/api";
import { canConfigureEngine, canManageRoles } from "@/lib/rbac";
import { useSession } from "@/lib/session-context";
import {
  ROLE_LABEL,
  TACTICAL_ROLES,
  type EngineConfig,
  type EngineMode,
  type OfficerProfile,
  type TacticalRole,
} from "@/types/sentinel";

/* ------------------------------------------------------------------ */
/* Section 2 — Pending Military Officer Approval                       */
/* ------------------------------------------------------------------ */

function PendingApprovalManager() {
  const [pendingList, setPendingList] = useState<OfficerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ kind: "error" | "info" | "success"; message: string } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pending-officers");
      if (res.ok) {
        const data = await res.json();
        setPendingList(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn("Failed fetching pending officers", e);
    } finally {
      setLoading(false);
    }
  };

  useState(() => {
    fetchPending();
  });

  const handleApprove = async (officerId: string, officerName: string) => {
    setProcessingId(officerId);
    setActionNotice(null);
    try {
      const res = await fetch("/api/admin/approve-officer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officer_id: officerId,
          approved_by: "Jenderal TNI (Purn) Okitr / Panglima Siber",
        }),
      });
      if (res.ok) {
        setActionNotice({
          kind: "success",
          message: `Personel ${officerName} berhasil DISETUJUI (APPROVED). Status akun aktif & tersimpan di PostgreSQL ledger.`,
        });
        await fetchPending();
      }
    } catch (err: any) {
      setActionNotice({ kind: "error", message: err?.message || "Gagal menyetujui pendaftaran" });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (officerId: string, officerName: string) => {
    setProcessingId(officerId);
    setActionNotice(null);
    try {
      const res = await fetch("/api/admin/reject-officer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officer_id: officerId,
          approved_by: "Jenderal TNI (Purn) Okitr / Panglima Siber",
        }),
      });
      if (res.ok) {
        setActionNotice({
          kind: "info",
          message: `Pengajuan personel ${officerName} telah DITOLAK.`,
        });
        await fetchPending();
      }
    } catch (err: any) {
      setActionNotice({ kind: "error", message: err?.message || "Gagal menolak pendaftaran" });
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveAll = async () => {
    setProcessingId("all");
    for (const off of pendingList) {
      await fetch("/api/admin/approve-officer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officer_id: off.id,
          approved_by: "Jenderal TNI (Purn) Okitr / Panglima Siber",
        }),
      });
    }
    setActionNotice({
      kind: "success",
      message: `Semua (${pendingList.length}) pendaftaran personel berhasil disetujui (APPROVED)!`,
    });
    await fetchPending();
    setProcessingId(null);
  };

  const pendingColumns: Column<OfficerProfile>[] = [
    {
      key: "officer",
      header: "Personel Baru",
      render: (o) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center border border-yellow-500/40 bg-yellow-500/10 font-mono text-[10px] text-yellow-400">
            {o.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div className="text-[13px] font-semibold text-paper">{o.name}</div>
            <div className="font-mono text-[11px] text-muted">{o.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "nrp",
      header: "Nomor Anggota (NRP)",
      render: (o) => <Mono className="text-paper font-bold">{o.nrp || "-"}</Mono>,
    },
    {
      key: "rank_unit",
      header: "Pangkat & Kesatuan",
      render: (o) => (
        <div className="text-xs">
          <span className="font-medium text-paper">{o.rank || "Perwira"}</span>
          <span className="text-muted block text-[11px]">{o.unit || "PUSSANSERAD"}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role Diajukan",
      render: (o) => <Tag tone="muted">{o.role}</Tag>,
    },
    {
      key: "status",
      header: "Status",
      render: () => (
        <span className="inline-flex items-center gap-1.5 border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-yellow-400">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-ping" />
          PENDING
        </span>
      ),
    },
    {
      key: "action",
      header: "Aksi Persetujuan",
      render: (o) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            loading={processingId === o.id}
            onClick={() => handleApprove(o.id, o.name)}
            className="text-[11px] bg-emerald-600 hover:bg-emerald-500 border-none text-white"
          >
            ✅ Setujui
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={processingId === o.id}
            onClick={() => handleReject(o.id, o.name)}
            className="text-[11px] border-red-500/40 text-red-300 hover:bg-red-500/20"
          >
            ❌ Tolak
          </Button>
        </div>
      ),
    },
  ];

  const pagination = usePagination(pendingList, 10);

  return (
    <Panel
      eyebrow="Section 02 · Super Admin Approval Queue"
      title="Persetujuan Pendaftaran Personel Militer Baru"
      bodyClassName="p-0"
      actions={
        <div className="flex items-center gap-2">
          {pendingList.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              loading={processingId === "all"}
              onClick={handleApproveAll}
              className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 text-[11px]"
            >
              ⚡ Setujui Semua ({pendingList.length})
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<Icon.Refresh size={13} />} onClick={fetchPending} loading={loading}>
            Refresh
          </Button>
        </div>
      }
    >
      {actionNotice && (
        <div className="px-5 pt-4">
          <Notice notice={actionNotice} onClose={() => setActionNotice(null)} />
        </div>
      )}
      <DataTable
        columns={pendingColumns}
        rows={pagination.paginatedItems}
        rowKey={(o) => o.id}
        isLoading={loading}
        emptyTitle="Tidak Ada Pengajuan Menunggu"
        emptyMessage="Semua formulir pendaftaran personel militer baru telah diverifikasi dan disetujui."
      />
      <Pagination
        idPrefix="pending-officers-table"
        currentPage={pagination.currentPage}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Section 3 — Role management                                         */
/* ------------------------------------------------------------------ */

function RoleManager() {
  const officers = useAsyncResource(fetchOfficers);
  const save = useAction(onUpdateUserRole);
  const [drafts, setDrafts] = useState<Record<string, TacticalRole>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const columns: Column<OfficerProfile>[] = [
    {
      key: "name",
      header: "Officer",
      render: (o) => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center border border-line-strong font-mono text-[10px]">
            {o.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-[13px] font-medium">{o.name}</span>
        </div>
      ),
    },
    { key: "email", header: "Email", render: (o) => <Mono className="text-muted">{o.email}</Mono> },
    { key: "current", header: "Current Role", render: (o) => <Tag tone="muted">{o.role}</Tag> },
    {
      key: "assign",
      header: "Assign Role",
      render: (o) => (
        <div className="w-52">
          <Select
            id={`role-select-${o.id}`}
            value={drafts[o.id] ?? o.role}
            onChange={(e) => setDrafts((d) => ({ ...d, [o.id]: e.target.value as TacticalRole }))}
          >
            {TACTICAL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      ),
    },
    {
      key: "save",
      header: "",
      render: (o) => {
        const dirty = drafts[o.id] && drafts[o.id] !== o.role;
        return (
          <Button
            id={`role-save-${o.id}`}
            size="sm"
            variant={dirty ? "primary" : "outline"}
            disabled={!dirty}
            loading={savingId === o.id && save.isPending}
            onClick={async () => {
              setSavingId(o.id);
              const res = await save.run(o.id, drafts[o.id]);
              if (res) officers.refetch();
              setSavingId(null);
            }}
          >
            Save Role
          </Button>
        );
      },
    },
  ];

  const pagination = usePagination(officers.data, 10);

  return (
    <Panel
      eyebrow="Section 02 · Super Admin Only"
      title="Role Management"
      bodyClassName="p-0"
      actions={
        <Button id="admin-refresh-officers" size="sm" variant="ghost" icon={<Icon.Refresh size={13} />} onClick={officers.refetch}>
          Refresh
        </Button>
      }
    >
      <div className="px-5 pt-4">
        <Notice notice={save.notice} onClose={() => save.setNotice(null)} />
      </div>
      <ErrorLine error={officers.error} />
      <DataTable
        columns={columns}
        rows={pagination.paginatedItems}
        rowKey={(o) => o.id}
        isLoading={officers.isLoading}
        emptyTitle="No registered officers"
        emptyMessage="Officers appear here after their first Google sign-in (Supabase `profiles` table)."
      />
      <Pagination
        idPrefix="officers-table"
        currentPage={pagination.currentPage}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Section 3 — Engine config                                           */
/* ------------------------------------------------------------------ */

function EngineConfigPanel({ editable }: { editable: boolean }) {
  const { engine, setEngine } = useSession();
  const [draft, setDraft] = useState<EngineConfig>(engine);
  const save = useAction(onSaveEngineConfig);

  const MODES: { value: EngineMode; title: string; sub: string }[] = [
    { value: "CLOUD_SANDBOX", title: "Cloud Sandbox API", sub: "Prototype evaluation · Gemini 2.5 Flash / Claude" },
    { value: "ON_PREMISE", title: "On-Premise Air-Gapped Engine", sub: "Local LLM · Ollama / vLLM endpoint" },
  ];

  const handleAutoFillSumopod = () => {
    setDraft({
      mode: "CLOUD_SANDBOX",
      modelName: "MiniMax-M3.1-Flash-Preview",
      localEndpointUrl: "https://ai.sumopod.com/v1",
    });
  };

  return (
    <Panel
      eyebrow="Section 03"
      title="AI Engine & Network Mode"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAutoFillSumopod}
          disabled={!editable}
          icon={<Icon.Refresh size={12} />}
          className="border-paper/40 text-paper text-[11px] hover:bg-paper hover:text-ink"
        >
          ⚡ Auto-Fill Sumopod AI Gateway
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {MODES.map((m) => {
            const active = draft.mode === m.value;
            return (
              <button
                key={m.value}
                id={`engine-mode-${m.value.toLowerCase()}`}
                type="button"
                disabled={!editable}
                onClick={() => setDraft((d) => ({ ...d, mode: m.value }))}
                className={cn(
                  "flex cursor-pointer items-start gap-3 border p-4 text-left transition-all disabled:cursor-not-allowed",
                  active ? "border-paper bg-paper text-ink" : "border-line hover:border-line-strong",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    active ? "border-ink" : "border-muted",
                  )}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-ink" />}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{m.title}</span>
                  <span className={cn("font-mono text-[10.5px]", active ? "text-ink/60" : "text-muted")}>{m.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Model Name (Pilih Model AI)">
            <div className="flex flex-col gap-2">
              <Select
                id="engine-model-select"
                disabled={!editable}
                value={
                  (draft.mode === "CLOUD_SANDBOX"
                    ? [
                        "MiniMax-M3.1-Flash-Preview",
                        "gemini-2.5-flash",
                        "gemini-2.5-pro",
                        "claude-3-7-sonnet",
                        "gpt-4o",
                      ]
                    : ["llama3.1:70b", "llama3.3:70b", "qwen2.5-coder:32b", "deepseek-r1:32b", "mistral-small:24b"]
                  ).includes(draft.modelName)
                    ? draft.modelName
                    : "__CUSTOM__"
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__CUSTOM__") {
                    setDraft((d) => ({ ...d, modelName: d.modelName || "" }));
                  } else {
                    setDraft((d) => ({ ...d, modelName: val }));
                  }
                }}
              >
                {draft.mode === "CLOUD_SANDBOX" ? (
                  <optgroup label="Cloud Sandbox AI Models (API Gateway)">
                    <option value="MiniMax-M3.1-Flash-Preview">MiniMax-M3.1-Flash-Preview (Sumopod Gateway · Default)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Google Vertex AI / Flash Reasoning)</option>
                    <option value="gemini-2.5-pro">gemini-2.5-pro (Google Deep Cyber Reasoning)</option>
                    <option value="claude-3-7-sonnet">claude-3-7-sonnet (Anthropic Tactical Claude)</option>
                    <option value="gpt-4o">gpt-4o (OpenAI Defense Gateway)</option>
                  </optgroup>
                ) : (
                  <optgroup label="On-Premise Air-Gapped Models (Ollama / Local vLLM)">
                    <option value="llama3.1:70b">llama3.1:70b (Ollama Tactical Defense Guard)</option>
                    <option value="llama3.3:70b">llama3.3:70b (Meta Llama 3.3 Defense Edition)</option>
                    <option value="qwen2.5-coder:32b">qwen2.5-coder:32b (Local Cyber Forensic Code/Log)</option>
                    <option value="deepseek-r1:32b">deepseek-r1:32b (Local Cyber Forensic Reasoning)</option>
                    <option value="mistral-small:24b">mistral-small:24b (Low-Latency Tactical Edge)</option>
                  </optgroup>
                )}
                <option value="__CUSTOM__">⚡ Ketik Nama Model Lain (Custom Model)...</option>
              </Select>

              {!(
                draft.mode === "CLOUD_SANDBOX"
                  ? [
                      "MiniMax-M3.1-Flash-Preview",
                      "gemini-2.5-flash",
                      "gemini-2.5-pro",
                      "claude-3-7-sonnet",
                      "gpt-4o",
                    ]
                  : ["llama3.1:70b", "llama3.3:70b", "qwen2.5-coder:32b", "deepseek-r1:32b", "mistral-small:24b"]
              ).includes(draft.modelName) && (
                <Input
                  id="engine-model-name-custom"
                  className="font-mono text-xs"
                  disabled={!editable}
                  value={draft.modelName}
                  onChange={(e) => setDraft((d) => ({ ...d, modelName: e.target.value }))}
                  placeholder="Ketik model kustom (e.g. gemma2:27b / mistral:latest)"
                />
              )}
            </div>
          </Field>
          <Field label="Local LLM / vLLM Endpoint URL" hint="Required for On-Premise Air-Gapped mode">
            <Input
              id="engine-endpoint-url"
              className="font-mono"
              disabled={!editable || draft.mode !== "ON_PREMISE"}
              value={draft.localEndpointUrl}
              onChange={(e) => setDraft((d) => ({ ...d, localEndpointUrl: e.target.value }))}
              placeholder="http://10.0.0.12:8000/v1"
            />
          </Field>
        </div>

        <Notice notice={save.notice} onClose={() => save.setNotice(null)} />

        <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
          <span className="font-mono text-[10.5px] text-subtle">
            {editable ? "Applied locally immediately; persisted to backend when wired." : "Read-only for your role."}
          </span>
          <Button
            id="engine-save"
            variant="primary"
            disabled={!editable}
            loading={save.isPending}
            onClick={async () => {
              setEngine(draft);
              await save.run(draft);
            }}
          >
            Apply Configuration
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AdminPage() {
  const { session, role } = useSession();
  if (!session || !role) return null;
  const u = session.user;

  return (
    <RoleGate route="admin">
      <PageHeader
        eyebrow={role === "SUPER_ADMIN" ? "Administration" : role === "COMMANDER" ? "Command Administration" : "Officer Administration"}
        title={
          role === "SUPER_ADMIN"
            ? "Profile, RBAC & Engine Config"
            : role === "COMMANDER"
            ? "Profile & Tactical Engine Config"
            : "Officer Profile & Clearance"
        }
        description={
          role === "SUPER_ADMIN"
            ? "Officer identity, role-based access control and AI engine routing between cloud sandbox and on-premise air-gapped inference."
            : role === "COMMANDER"
            ? "Officer identity and tactical AI engine routing between cloud sandbox and on-premise air-gapped inference."
            : "Officer credentials, assigned tactical clearance level, and verified digital signature public key."
        }
      />

      {/* Section 1 — Profile */}
      <Panel eyebrow="Section 01" title="My Officer Profile">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center bg-paper text-2xl font-semibold text-ink">
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover grayscale" />
            ) : (
              u.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-1">
              <Eyebrow>Name</Eyebrow>
              <span className="text-sm font-medium">{u.name}</span>
            </div>
            <div className="flex flex-col gap-1">
              <Eyebrow>Email</Eyebrow>
              <Mono>{u.email}</Mono>
            </div>
            <div className="flex flex-col gap-1">
              <Eyebrow>Assigned Tactical Role</Eyebrow>
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="inverted">{u.role}</Tag>
                {role !== u.role && <Tag tone="muted">Simulating {ROLE_LABEL[role]}</Tag>}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Eyebrow>Digital Signature Public Key</Eyebrow>
              <Mono className="truncate text-muted">{u.publicKey ?? "Not provisioned"}</Mono>
            </div>
          </div>
        </div>
      </Panel>

      {/* Section 2 — Pending Military Officer Registrations Approval */}
      {role === "SUPER_ADMIN" && <PendingApprovalManager />}

      {/* Section 3 — Role Management */}
      {canManageRoles(role) && <RoleManager />}

      {/* Section 4 — AI Engine Config */}
      {canConfigureEngine(role) && <EngineConfigPanel editable={true} />}
    </RoleGate>
  );
}

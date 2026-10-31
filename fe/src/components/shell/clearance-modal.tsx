"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Input, Select } from "@/components/ui";
import { generateClearanceAutoFill } from "@/lib/autofill-generator";
import { useSession } from "@/lib/session-context";

interface ClearanceModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export function ClearanceModal({ isOpen, onSuccess }: ClearanceModalProps) {
  const { session, setClearanceApproved } = useSession();
  const [sprintNumber, setSprintNumber] = useState("");
  const [sector, setSector] = useState("SEKTOR-01-MABES-PUSSIBERAD");
  const [clearanceLevel, setClearanceLevel] = useState("TOP_SECRET_LEVEL_4");
  const [agreement, setAgreement] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAutoFill = () => {
    const preset = generateClearanceAutoFill(session?.user?.email);
    setSprintNumber(preset.sprintNumber);
    const sectorOpts = [
      "SEKTOR-01-MABES-PUSSIBERAD",
      "SEKTOR-02-KODAM-JAYA",
      "SEKTOR-03-KOOPSUDNAS",
      "SEKTOR-04-ARMORY-TACTICAL",
    ];
    const levelOpts = [
      "TOP_SECRET_LEVEL_4",
      "SECRET_LEVEL_3",
      "CONFIDENTIAL_LEVEL_2",
    ];
    const hash = preset.sprintNumber
      .split("")
      .reduce((a, c) => a + c.charCodeAt(0), 0);
    setSector(sectorOpts[hash % sectorOpts.length]);
    setClearanceLevel(levelOpts[hash % levelOpts.length]);
    setAgreement(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sprintNumber.trim() || !agreement) return;

    setSubmitting(true);
    setTimeout(() => {
      setClearanceApproved(true);
      setSubmitting(false);
      onSuccess();
    }, 350);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-md">
      <div className="relative flex w-full max-w-lg flex-col border border-line-strong bg-surface p-6 shadow-2xl">
        <span className="pointer-events-none absolute left-0 top-0 h-[2px] w-14 bg-brass" />

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <Icon.Gate size={18} className="text-brass" />
            <div>
              <h2 className="font-display text-lg font-medium text-paper">
                Pengesahan Surat Perintah Operasi
              </h2>
              <span className="font-mono text-[10.5px] text-muted">
                Otorisasi Konsol Alutsista · Pussiberad TNI-AD
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoFill}
            icon={<Icon.Refresh size={12} />}
          >
            ⚡ Isi Otomatis Sprin
          </Button>
        </div>

        <div className="my-4 text-xs leading-relaxed text-muted">
          Personel:{" "}
          <strong className="text-paper">
            {session?.user?.name || "Perwira Siber"}
          </strong>{" "}
          ({session?.user?.role || "COMMANDER"}). Sahkan nomor Surat Perintah
          Tugas (Sprin) sebelum mengoperasikan konsol:
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Nomor Surat Perintah Tugas (Sprin)
            </label>
            <Input
              value={sprintNumber}
              onChange={(e) => setSprintNumber(e.target.value)}
              placeholder="contoh: SPRINT/1089/X/2026/PUSSIBERAD"
              className="font-mono text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                Sektor Komando
              </label>
              <Select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="text-xs"
              >
                <option value="SEKTOR-01-MABES-PUSSIBERAD">
                  Sektor 01 · Mabes Pussiberad
                </option>
                <option value="SEKTOR-02-KODAM-JAYA">
                  Sektor 02 · Kodam Jaya / Radar
                </option>
                <option value="SEKTOR-03-KOOPSUDNAS">
                  Sektor 03 · Avionik Pertahanan
                </option>
                <option value="SEKTOR-04-ARMORY-TACTICAL">
                  Sektor 04 · Gudang Munisi
                </option>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                Klasifikasi Dokumen
              </label>
              <Select
                value={clearanceLevel}
                onChange={(e) => setClearanceLevel(e.target.value)}
                className="text-xs"
              >
                <option value="TOP_SECRET_LEVEL_4">
                  Tingkat 4 · Sangat Rahasia
                </option>
                <option value="SECRET_LEVEL_3">Tingkat 3 · Rahasia</option>
                <option value="CONFIDENTIAL_LEVEL_2">
                  Tingkat 2 · Terbatas
                </option>
              </Select>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 border border-line bg-surface-2/60 p-3 text-xs text-muted transition-colors hover:border-brass">
            <input
              type="checkbox"
              checked={agreement}
              onChange={(e) => setAgreement(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
              required
            />
            <span>
              Menyatakan bertindak atas penugasan resmi TNI Angkatan Darat dan
              menjaga integritas rantai bukti kriptografi alutsista.
            </span>
          </label>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={submitting}
            disabled={!sprintNumber.trim() || !agreement}
            icon={<Icon.Arrow size={14} />}
            className="w-full justify-center"
          >
            Sahkan &amp; Buka Konsol Komando
          </Button>
        </form>
      </div>
    </div>
  );
}

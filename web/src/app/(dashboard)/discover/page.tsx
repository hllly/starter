"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, ArrowRight, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

const BUYER_TYPE_OPTIONS = [
  { value: "importer", label: "进口商" },
  { value: "distributor", label: "分销商" },
  { value: "wholesaler", label: "批发商" },
  { value: "brand_sourcing", label: "品牌采购" },
  { value: "chain_retail_buyer", label: "连锁零售采购" },
  { value: "trading_company", label: "贸易公司" },
];

const PRIORITY_OPTIONS = [
  { value: "容易成交", label: "容易成交" },
  { value: "采购意向强", label: "采购意向强" },
  { value: "OEM/ODM 适配", label: "OEM/ODM 适配" },
  { value: "长期开发", label: "长期开发" },
  { value: "分销适配", label: "分销适配" },
];

const REGION_OPTIONS = [
  { value: "美国", en: "United States" },
  { value: "东盟主要国家", en: "ASEAN" },
  { value: "日本", en: "Japan" },
  { value: "韩国", en: "South Korea" },
  { value: "欧盟主要国家", en: "EU" },
  { value: "英国", en: "United Kingdom" },
  { value: "俄罗斯", en: "Russia" },
  { value: "印度", en: "India" },
  { value: "中东海湾国家", en: "Gulf States" },
  { value: "巴西", en: "Brazil" },
  { value: "墨西哥", en: "Mexico" },
  { value: "加拿大", en: "Canada" },
  { value: "澳大利亚", en: "Australia" },
];

const STORAGE_KEY = "discover-draft";
const STATUS_TEXT: Record<string, string> = {
  queued: "等待处理",
  claimed: "任务已接收",
  running: "正在整理目标客户",
  awaiting_review: "正在准备发布",
  published: "结果已可查看",
  failed: "本轮处理未完成",
  cancelled: "任务已取消",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  published:       { bg: "#E4F6EE", text: "#137A57" },
  queued:          { bg: "#ECF2F0", text: "#47635C" },
  claimed:         { bg: "#ECF2F0", text: "#47635C" },
  running:         { bg: "#EAF1FA", text: "#486E9C" },
  awaiting_review: { bg: "#EAF1FA", text: "#486E9C" },
  failed:          { bg: "#FDE8E8", text: "#C0392B" },
  cancelled:       { bg: "#F2ECE6", text: "#7A6654" },
};

interface FormData {
  productCategory: string;
  targetRegions: string[];
  buyerTypes: string[];
  priorityDirection: string;
  exclusionRules: string;
  supplyNotes: string;
  extraNotes: string;
}

const emptyForm: FormData = {
  productCategory: "",
  targetRegions: [],
  buyerTypes: [],
  priorityDirection: "",
  exclusionRules: "",
  supplyNotes: "",
  extraNotes: "",
};

interface RecentTask {
  id: string;
  productCategory: string;
  status: string;
  statusText: string;
  leadCount: number | null;
  createdAt: string;
}

export default function DiscoverPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(emptyForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isPending, startTransition] = useTransition();
  const [submitMsg, setSubmitMsg] = useState("");
  const [recentTask, setRecentTask] = useState<RecentTask | null>(null);
  const [hasRunning, setHasRunning] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setForm(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    }, 500);
    return () => clearTimeout(timer);
  }, [form]);

  const loadRecentTask = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: RecentTask[] }>("/api/discovery-requests?limit=1");
      if (res.data.length > 0) {
        setRecentTask(res.data[0]);
        const running = ["queued", "claimed", "running", "awaiting_review"];
        setHasRunning(running.includes(res.data[0].status));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadRecentTask();
  }, [loadRecentTask]);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function toggleRegion(r: string) {
    setForm((prev) => ({
      ...prev,
      targetRegions: prev.targetRegions.includes(r)
        ? prev.targetRegions.filter((x) => x !== r)
        : [...prev.targetRegions, r],
    }));
    setErrors((prev) => ({ ...prev, targetRegions: undefined }));
  }

  function toggleBuyerType(bt: string) {
    setForm((prev) => ({
      ...prev,
      buyerTypes: prev.buyerTypes.includes(bt)
        ? prev.buyerTypes.filter((x) => x !== bt)
        : [...prev.buyerTypes, bt],
    }));
    setErrors((prev) => ({ ...prev, buyerTypes: undefined }));
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.productCategory.trim()) e.productCategory = "请填写目标品类";
    if (form.targetRegions.length === 0) e.targetRegions = "至少选择一个地区";
    if (form.buyerTypes.length === 0) e.buyerTypes = "至少选择一种客户类型";
    if (!form.priorityDirection) e.priorityDirection = "请选择优先方向";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitMsg("");

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          productCategory: form.productCategory.trim(),
          targetRegions: form.targetRegions,
          buyerTypes: form.buyerTypes,
          priorityDirection: form.priorityDirection,
        };

        const adv: Record<string, string> = {};
        if (form.exclusionRules.trim()) adv.exclusionRules = form.exclusionRules.trim();
        if (form.supplyNotes.trim()) adv.supplyNotes = form.supplyNotes.trim();
        if (form.extraNotes.trim()) adv.extraNotes = form.extraNotes.trim();
        if (Object.keys(adv).length > 0) payload.advancedOptions = adv;

        const res = await apiFetch<{ id: string; hint?: string }>("/api/discovery-requests", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (res.hint) {
          setSubmitMsg(res.hint);
        } else {
          localStorage.removeItem(STORAGE_KEY);
          setForm(emptyForm);
          setSubmitMsg("任务已提交，结果将在处理完成后出现在「线索」页");
          loadRecentTask();
        }
      } catch (err) {
        setSubmitMsg(err instanceof Error ? err.message : "提交失败");
      }
    });
  }

  const statusColor = recentTask ? STATUS_COLORS[recentTask.status] ?? STATUS_COLORS.queued : null;

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1C1C1A" }}>客户发现</h1>
        <p style={{ fontSize: "15px", color: "#6D6A63", marginTop: "6px" }}>
          帮你持续发现潜在客户，并沉淀可维护线索。
        </p>
      </div>

      {/* ── Recent task ── */}
      {recentTask && (
        <div
          className="flex items-center justify-between"
          style={{
            backgroundColor: "white",
            border: "1px solid #E7E3DA",
            borderRadius: "18px",
            padding: "16px 20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ fontSize: "14px", color: "#6D6A63" }}>最近任务：</span>
            <span style={{ fontSize: "15px", fontWeight: 600, color: "#1C1C1A" }}>
              {recentTask.productCategory}
            </span>
            {statusColor && (
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                }}
              >
                {recentTask.statusText || STATUS_TEXT[recentTask.status] || recentTask.status}
              </span>
            )}
            {recentTask.leadCount != null && (
              <span style={{ fontSize: "13px", color: "#9A958E" }}>{recentTask.leadCount} 条线索</span>
            )}
          </div>
          {recentTask.status === "published" && (
            <button
              onClick={() => router.push("/leads")}
              className="flex items-center gap-1 transition-colors"
              style={{ fontSize: "14px", fontWeight: 600, color: "#1A7F64" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#1A7F64")}
            >
              查看结果
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Form container ── */}
      <div
        style={{
          backgroundColor: "#F7F6F2",
          borderRadius: "24px",
          padding: "32px",
        }}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1C1C1A", marginBottom: "24px" }}>
          提交客户发现任务
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Product category ── */}
          <FormSection label="目标品类" required error={errors.productCategory}>
            <input
              type="text"
              placeholder="例：宠物用品、LED灯具、家居收纳"
              value={form.productCategory}
              onChange={(e) => updateField("productCategory", e.target.value)}
              className="w-full outline-none transition-colors"
              style={{
                fontSize: "16px",
                fontWeight: 500,
                color: "#1C1C1A",
                backgroundColor: "white",
                border: "1px solid #E7E3DA",
                borderRadius: "14px",
                padding: "12px 16px",
                height: "48px",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#1A7F64")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#E7E3DA")}
            />
          </FormSection>

          {/* ── Target regions ── */}
          <FormSection label="目标地区" required error={errors.targetRegions}>
            <div className="flex flex-wrap gap-2.5">
              {REGION_OPTIONS.map((r) => {
                const active = form.targetRegions.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => toggleRegion(r.value)}
                    className="transition-all"
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      padding: "8px 14px",
                      borderRadius: "999px",
                      border: active ? "1px solid #1A7F64" : "1px solid #E7E3DA",
                      backgroundColor: active ? "#E4F6EE" : "white",
                      color: active ? "#0F7A5A" : "#4F5752",
                      cursor: "pointer",
                    }}
                  >
                    {r.value}
                    <span style={{ marginLeft: "4px", opacity: 0.5 }}>{r.en}</span>
                  </button>
                );
              })}
            </div>
          </FormSection>

          {/* ── Buyer types ── */}
          <FormSection label="客户类型" required error={errors.buyerTypes}>
            <div className="flex flex-wrap gap-2.5">
              {BUYER_TYPE_OPTIONS.map((bt) => {
                const active = form.buyerTypes.includes(bt.value);
                return (
                  <button
                    key={bt.value}
                    type="button"
                    onClick={() => toggleBuyerType(bt.value)}
                    className="transition-all"
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      padding: "8px 14px",
                      borderRadius: "999px",
                      border: active ? "1px solid #1A7F64" : "1px solid #E7E3DA",
                      backgroundColor: active ? "#E4F6EE" : "white",
                      color: active ? "#0F7A5A" : "#4F5752",
                      cursor: "pointer",
                    }}
                  >
                    {bt.label}
                  </button>
                );
              })}
            </div>
          </FormSection>

          {/* ── Priority direction (single select pills) ── */}
          <FormSection label="优先方向" required error={errors.priorityDirection}>
            <div className="flex flex-wrap gap-2.5">
              {PRIORITY_OPTIONS.map((p) => {
                const active = form.priorityDirection === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => updateField("priorityDirection", active ? "" : p.value)}
                    className="transition-all"
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      padding: "8px 14px",
                      borderRadius: "999px",
                      border: active ? "1px solid #1A7F64" : "1px solid #E7E3DA",
                      backgroundColor: active ? "#E4F6EE" : "white",
                      color: active ? "#0F7A5A" : "#4F5752",
                      cursor: "pointer",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </FormSection>

          {/* ── Advanced options toggle ── */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 transition-colors"
              style={{ fontSize: "15px", fontWeight: 600, color: "#6D6A63", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#1C1C1A")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#6D6A63")}
            >
              高级选项
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAdvanced && (
              <div
                className="mt-4 space-y-4"
                style={{
                  backgroundColor: "#F0EDE7",
                  border: "1px solid #E7E3DA",
                  borderRadius: "18px",
                  padding: "20px 22px",
                }}
              >
                <AdvancedField
                  label="排除项"
                  placeholder="例：排除中国同行、排除零售商"
                  value={form.exclusionRules}
                  onChange={(v) => updateField("exclusionRules", v)}
                />
                <AdvancedField
                  label="供货能力"
                  placeholder="例：支持 OEM/ODM，MOQ 500pcs"
                  value={form.supplyNotes}
                  onChange={(v) => updateField("supplyNotes", v)}
                />
                <AdvancedField
                  label="补充说明"
                  placeholder="其他需要说明的内容"
                  value={form.extraNotes}
                  onChange={(v) => updateField("extraNotes", v)}
                />
              </div>
            )}
          </div>

          {/* ── Running hint ── */}
          {hasRunning && (
            <p
              style={{
                fontSize: "13px",
                color: "#47635C",
                backgroundColor: "#ECF2F0",
                borderRadius: "12px",
                padding: "10px 14px",
              }}
            >
              当前有任务处理中，新任务会排队等待执行。
            </p>
          )}

          {/* ── Submit ── */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              disabled={isPending}
              className="transition-colors"
              style={{
                fontSize: "16px",
                fontWeight: 600,
                height: "48px",
                padding: "0 24px",
                borderRadius: "14px",
                backgroundColor: "#0F7A5A",
                color: "white",
                border: "none",
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  提交中…
                </>
              ) : (
                "提交发现任务"
              )}
            </Button>
            {submitMsg && (
              <p style={{ fontSize: "14px", color: "#6D6A63" }}>{submitMsg}</p>
            )}
          </div>
        </form>
      </div>

      {/* ── Footer hint ── */}
      <p className="text-center" style={{ fontSize: "13px", color: "#B6A793", paddingBottom: "16px" }}>
        正在内测的能力：客户维护 · 开发信辅助 · 自动跟进 · 全网动向追踪和画像构建
      </p>
    </div>
  );
}

function FormSection({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <label style={{ fontSize: "15px", fontWeight: 600, color: "#1C1C1A" }}>
        {label}
        {required && <span style={{ color: "#C0392B", marginLeft: "4px" }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: "13px", color: "#C0392B" }}>{error}</p>}
    </div>
  );
}

function AdvancedField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label style={{ fontSize: "14px", fontWeight: 600, color: "#6D6A63" }}>{label}</label>
      <Textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="outline-none"
        style={{
          fontSize: "15px",
          color: "#1C1C1A",
          backgroundColor: "white",
          border: "1px solid #E7E3DA",
          borderRadius: "12px",
          padding: "10px 14px",
          resize: "none",
        }}
      />
    </div>
  );
}

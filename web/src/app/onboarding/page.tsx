"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

const REGION_OPTIONS = [
  "美国", "加拿大", "墨西哥", "巴西",
  "英国", "德国", "法国", "意大利", "西班牙", "荷兰", "波兰",
  "日本", "韩国", "澳大利亚",
  "印度", "泰国", "越南", "印尼", "马来西亚", "菲律宾",
  "俄罗斯", "沙特阿拉伯", "阿联酋",
];

const BUYER_TYPE_OPTIONS = [
  { value: "importer", label: "进口商" },
  { value: "distributor", label: "分销商" },
  { value: "wholesaler", label: "批发商" },
  { value: "brand_sourcing", label: "品牌采购" },
  { value: "chain_retail_buyer", label: "连锁零售采购" },
  { value: "trading_company", label: "贸易公司" },
  { value: "online_retailer", label: "电商卖家" },
  { value: "oem_odm", label: "OEM/ODM 客户" },
];

const SCALE_OPTIONS = ["不限", "小型 (1-50人)", "中型 (50-500人)", "大型 (500人以上)"];

interface FormData {
  mainCategory: string;
  subCategories: string;
  targetRegions: string[];
  targetBuyerTypes: string[];
  excludedBuyerTypes: string[];
  productPositioning: string;
  targetCustomerDesc: string;
  websiteUrl: string;
  coreSellingPoints: string;
  moqPriceRange: string;
  customerScalePref: string;
  exclusionConditions: string;
}

const emptyForm: FormData = {
  mainCategory: "",
  subCategories: "",
  targetRegions: [],
  targetBuyerTypes: [],
  excludedBuyerTypes: [],
  productPositioning: "",
  targetCustomerDesc: "",
  websiteUrl: "",
  coreSellingPoints: "",
  moqPriceRange: "",
  customerScalePref: "",
  exclusionConditions: "",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState("");

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function toggleArrayField(key: "targetRegions" | "targetBuyerTypes" | "excludedBuyerTypes", value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((x) => x !== value)
        : [...prev[key], value],
    }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.mainCategory.trim()) e.mainCategory = "请填写主品类";
    if (!form.subCategories.trim()) e.subCategories = "请填写子品类/具体产品关键词";
    if (form.targetRegions.length === 0) e.targetRegions = "至少选择一个目标国家/地区";
    if (form.targetBuyerTypes.length === 0) e.targetBuyerTypes = "至少选择一种目标客户类型";
    if (!form.productPositioning.trim()) e.productPositioning = "请填写产品定位";
    if (!form.targetCustomerDesc.trim()) e.targetCustomerDesc = "请填写目标客户描述";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitError("");

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          mainCategory: form.mainCategory.trim(),
          subCategories: form.subCategories.trim(),
          targetRegions: form.targetRegions,
          targetBuyerTypes: form.targetBuyerTypes,
          productPositioning: form.productPositioning.trim(),
          targetCustomerDesc: form.targetCustomerDesc.trim(),
        };

        if (form.excludedBuyerTypes.length > 0) payload.excludedBuyerTypes = form.excludedBuyerTypes;
        if (form.websiteUrl.trim()) payload.websiteUrl = form.websiteUrl.trim();
        if (form.coreSellingPoints.trim()) payload.coreSellingPoints = form.coreSellingPoints.trim();
        if (form.moqPriceRange.trim()) payload.moqPriceRange = form.moqPriceRange.trim();
        if (form.customerScalePref.trim()) payload.customerScalePref = form.customerScalePref.trim();
        if (form.exclusionConditions.trim()) payload.exclusionConditions = form.exclusionConditions.trim();

        await apiFetch("/api/user/business-profile", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        router.push("/discover");
        router.refresh();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "提交失败，请稍后重试");
      }
    });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: "#F7F6F2" }}
    >
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center" style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#1C1C1A" }}>
            完善你的业务信息
          </h1>
          <p style={{ fontSize: "15px", color: "#6D6A63", marginTop: "8px" }}>
            这些信息将帮助我们更精准地为你匹配潜在客户
          </p>
        </div>

        {/* Form card */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "24px",
            padding: "36px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-7">
            {/* ── 主品类 ── */}
            <FormField label="主品类" required error={errors.mainCategory}>
              <TextInput
                placeholder="例：宠物用品、LED灯具、家居收纳"
                value={form.mainCategory}
                onChange={(v) => updateField("mainCategory", v)}
              />
            </FormField>

            {/* ── 子品类/具体产品关键词 ── */}
            <FormField label="子品类 / 具体产品关键词" required error={errors.subCategories}>
              <TextareaInput
                placeholder="例：宠物玩具、猫抓板、智能喂食器（每行一个或逗号分隔）"
                value={form.subCategories}
                onChange={(v) => updateField("subCategories", v)}
                rows={3}
              />
            </FormField>

            {/* ── 目标国家/地区 ── */}
            <FormField label="目标国家 / 地区" required error={errors.targetRegions}>
              <PillSelect
                options={REGION_OPTIONS.map((r) => ({ value: r, label: r }))}
                selected={form.targetRegions}
                onToggle={(v) => toggleArrayField("targetRegions", v)}
              />
            </FormField>

            {/* ── 目标客户类型 ── */}
            <FormField label="目标客户类型" required error={errors.targetBuyerTypes}>
              <PillSelect
                options={BUYER_TYPE_OPTIONS}
                selected={form.targetBuyerTypes}
                onToggle={(v) => toggleArrayField("targetBuyerTypes", v)}
              />
            </FormField>

            {/* ── 排除客户类型 ── */}
            <FormField label="排除客户类型" hint="选填">
              <PillSelect
                options={BUYER_TYPE_OPTIONS}
                selected={form.excludedBuyerTypes}
                onToggle={(v) => toggleArrayField("excludedBuyerTypes", v)}
              />
            </FormField>

            {/* ── 产品定位 ── */}
            <FormField label="产品定位" required error={errors.productPositioning}>
              <TextareaInput
                placeholder="例：中高端，主打设计感和环保材质，面向注重品质的中产家庭"
                value={form.productPositioning}
                onChange={(v) => updateField("productPositioning", v)}
                rows={2}
              />
            </FormField>

            {/* ── 目标客户描述 ── */}
            <FormField label="目标客户描述" required error={errors.targetCustomerDesc}>
              <TextareaInput
                placeholder="例：年采购额 50万美元以上的宠物用品进口商，有自有品牌或线下渠道"
                value={form.targetCustomerDesc}
                onChange={(v) => updateField("targetCustomerDesc", v)}
                rows={3}
              />
            </FormField>

            {/* ── Divider ── */}
            <div
              style={{
                borderTop: "1px dashed #E7E3DA",
                margin: "8px 0",
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "-10px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  backgroundColor: "white",
                  padding: "0 12px",
                  fontSize: "13px",
                  color: "#9A958E",
                }}
              >
                以下为选填项
              </span>
            </div>

            {/* ── 官网/产品页 ── */}
            <FormField label="官网 / 产品页" hint="选填">
              <TextInput
                placeholder="https://www.example.com"
                value={form.websiteUrl}
                onChange={(v) => updateField("websiteUrl", v)}
              />
            </FormField>

            {/* ── 核心卖点 ── */}
            <FormField label="核心卖点" hint="选填">
              <TextareaInput
                placeholder="例：自有工厂、15天快速交付、支持小批量定制"
                value={form.coreSellingPoints}
                onChange={(v) => updateField("coreSellingPoints", v)}
                rows={2}
              />
            </FormField>

            {/* ── MOQ/价格带 ── */}
            <FormField label="MOQ / 价格带" hint="选填">
              <TextInput
                placeholder="例：MOQ 500件，单价 $3-8"
                value={form.moqPriceRange}
                onChange={(v) => updateField("moqPriceRange", v)}
              />
            </FormField>

            {/* ── 客户规模偏好 ── */}
            <FormField label="客户规模偏好" hint="选填">
              <PillSelect
                options={SCALE_OPTIONS.map((s) => ({ value: s, label: s }))}
                selected={form.customerScalePref ? [form.customerScalePref] : []}
                onToggle={(v) => updateField("customerScalePref", v === form.customerScalePref ? "" : v)}
                single
              />
            </FormField>

            {/* ── 排除条件 ── */}
            <FormField label="排除条件" hint="选填">
              <TextareaInput
                placeholder="例：排除纯线上电商卖家、排除年收入低于100万美元的公司"
                value={form.exclusionConditions}
                onChange={(v) => updateField("exclusionConditions", v)}
                rows={2}
              />
            </FormField>

            {/* ── Submit ── */}
            {submitError && (
              <p style={{ fontSize: "14px", color: "#C0392B", textAlign: "center" }}>{submitError}</p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 transition-all"
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "white",
                backgroundColor: isPending ? "#6DB89E" : "#0F7A5A",
                borderRadius: "14px",
                padding: "14px 24px",
                border: "none",
                cursor: isPending ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => { if (!isPending) e.currentTarget.style.backgroundColor = "#0D6B4E"; }}
              onMouseLeave={(e) => { if (!isPending) e.currentTarget.style.backgroundColor = "#0F7A5A"; }}
            >
              {isPending && <Loader2 className="h-5 w-5 animate-spin" />}
              {isPending ? "提交中…" : "开始使用"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <label style={{ fontSize: "15px", fontWeight: 600, color: "#1C1C1A", display: "flex", alignItems: "center", gap: "6px" }}>
        {label}
        {required && <span style={{ color: "#C0392B" }}>*</span>}
        {hint && <span style={{ fontSize: "13px", fontWeight: 400, color: "#9A958E" }}>({hint})</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: "13px", color: "#C0392B" }}>{error}</p>}
    </div>
  );
}

function TextInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full outline-none transition-colors"
      style={{
        fontSize: "15px",
        fontWeight: 500,
        color: "#1C1C1A",
        backgroundColor: "#FAFAF8",
        border: "1px solid #E7E3DA",
        borderRadius: "12px",
        padding: "11px 14px",
        height: "44px",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "#1A7F64"; e.currentTarget.style.backgroundColor = "white"; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "#E7E3DA"; e.currentTarget.style.backgroundColor = "#FAFAF8"; }}
    />
  );
}

function TextareaInput({
  placeholder,
  value,
  onChange,
  rows = 2,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full outline-none transition-colors"
      style={{
        fontSize: "15px",
        fontWeight: 500,
        color: "#1C1C1A",
        backgroundColor: "#FAFAF8",
        border: "1px solid #E7E3DA",
        borderRadius: "12px",
        padding: "11px 14px",
        resize: "none",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "#1A7F64"; e.currentTarget.style.backgroundColor = "white"; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = "#E7E3DA"; e.currentTarget.style.backgroundColor = "#FAFAF8"; }}
    />
  );
}

function PillSelect({
  options,
  selected,
  onToggle,
  single,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className="transition-all"
            style={{
              fontSize: "14px",
              fontWeight: active ? 600 : 500,
              color: active ? "#0F7A5A" : "#6D6A63",
              backgroundColor: active ? "#E4F6EE" : "#FAFAF8",
              border: `1px solid ${active ? "#0F7A5A" : "#E7E3DA"}`,
              borderRadius: "999px",
              padding: "7px 16px",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

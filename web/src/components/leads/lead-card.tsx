"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import type { Lead } from "./leads-list";
import {
  Globe,
  Linkedin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Mail,
  Phone,
} from "lucide-react";

const BUYER_TYPE_LABELS: Record<string, string> = {
  importer: "进口商",
  distributor: "分销商",
  wholesaler: "批发商",
  brand_sourcing: "品牌采购",
  chain_retail_buyer: "连锁零售",
  trading_company: "贸易公司",
  unknown: "",
};

const VALUE_TIER: Record<string, { label: string; bg: string; text: string }> = {
  contact_now:    { label: "高价值", bg: "#FDE8E8", text: "#C0392B" },
  contact_if_fit: { label: "中价值", bg: "#FEF0E6", text: "#D35400" },
  observe:        { label: "可观察", bg: "#F3F1EC", text: "#7A6E60" },
  contact_maybe:  { label: "待判断", bg: "#F3F1EC", text: "#7A6E60" },
  deprioritize:   { label: "低优先", bg: "#F3F1EC", text: "#7A6E60" },
};

const ACTION_STYLES: Record<string, { label: string; color: string }> = {
  contact_now:    { label: "建议联系", color: "#0F7A5A" },
  contact_if_fit: { label: "建议联系", color: "#2A6B63" },
  observe:        { label: "建议观察", color: "#5B635E" },
  contact_maybe:  { label: "建议补充验证", color: "#5B635E" },
  deprioritize:   { label: "建议跳过", color: "#7A6E60" },
};

const STATUS_LABELS: Record<string, string> = {
  new: "待处理",
  interested: "已关注",
  dismissed: "已排除",
  contacted: "已联系",
  following: "跟进中",
  paused: "暂不跟进",
  no_interest: "无意向",
  dealing: "交易中",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  new: "#8FA8A1",
  interested: "#34A37A",
  contacted: "#7A9AC3",
  following: "#7A9AC3",
  dealing: "#59B56E",
  paused: "#B6A793",
  dismissed: "#B6A793",
  no_interest: "#B6A793",
};

const STATUS_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  new:         { bg: "#ECF2F0", text: "#47635C" },
  interested:  { bg: "#E4F6EE", text: "#137A57" },
  contacted:   { bg: "#EAF1FA", text: "#486E9C" },
  following:   { bg: "#EAF1FA", text: "#486E9C" },
  dealing:     { bg: "#E8F6E8", text: "#2C8D43" },
  paused:      { bg: "#F2ECE6", text: "#7A6654" },
  dismissed:   { bg: "#F2ECE6", text: "#7A6654" },
  no_interest: { bg: "#F2ECE6", text: "#7A6654" },
};

const SOURCE_LABELS: Record<string, string> = {
  industry_directory: "行业目录",
  association: "行业协会",
  customs_data: "海关数据",
  marketplace: "电商平台",
  exhibitor_list: "展会名录",
  company_website: "官网提取",
  other: "其他来源",
};

const DISMISS_REASONS = [
  { value: "type_mismatch", label: "品类不符" },
  { value: "region_mismatch", label: "地区不符" },
  { value: "too_small", label: "规模不符" },
  { value: "info_insufficient", label: "信息不足" },
  { value: "duplicate", label: "重复" },
  { value: "other", label: "其他" },
];

const INTEREST_FOLLOWUP = [
  { value: "contact_now", label: "准备联系" },
  { value: "observe_first", label: "先观察" },
  { value: "need_verify", label: "需要补充验证" },
];

export function LeadCard({
  lead,
  taskCategory,
  onUpdate,
}: {
  lead: Lead;
  taskCategory?: string;
  onUpdate: (id: string, updates: Partial<Lead>) => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackAction, setFeedbackAction] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [showTrackTip, setShowTrackTip] = useState(false);
  const [showProfileTip, setShowProfileTip] = useState(false);
  const router = useRouter();

  const valueInfo = VALUE_TIER[lead.recommendedAction ?? "observe"] ?? VALUE_TIER.observe;
  const actionStyle = ACTION_STYLES[lead.recommendedAction ?? ""] ?? ACTION_STYLES.observe;
  const statusLabel = STATUS_LABELS[lead.status] ?? lead.status;
  const buyerLabel = BUYER_TYPE_LABELS[lead.buyerType ?? ""] ?? "";
  const statusBarColor = STATUS_BAR_COLORS[lead.status] ?? "#8FA8A1";
  const statusBadge = STATUS_BADGE_STYLES[lead.status] ?? STATUS_BADGE_STYLES.new;

  async function handleFeedback(action: string, reason?: string) {
    setSubmitting(true);
    try {
      const body: Record<string, string> = { action };
      if (reason) body.reason = reason;
      if (feedbackNote.trim()) body.note = feedbackNote.trim();
      const res = await apiFetch<{ leadStatus: string }>(`/api/leads/${lead.id}/feedback`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onUpdate(lead.id, { status: res.leadStatus });
      setFeedbackOpen(false);
      setFeedbackAction(null);
      setFeedbackNote("");
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  async function handleStatusPush(status: string) {
    setSubmitting(true);
    try {
      const res = await apiFetch<{ status: string; note: string | null }>(`/api/leads/${lead.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onUpdate(lead.id, { status: res.status, note: res.note });
      setFeedbackOpen(false);
      setFeedbackAction(null);
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  return (
    <div
      className="relative overflow-hidden bg-white"
      style={{
        borderRadius: "22px",
        border: "1px solid #E7E3DA",
        boxShadow: "0 4px 14px rgba(0,0,0,0.03)",
      }}
    >
      {/* Left status bar */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: "6px", backgroundColor: statusBarColor }}
      />

      {/* ═══ LAYER 1: Primary Judgment Area ═══ */}
      <div className="flex items-start justify-between gap-6 pl-7 pr-6 pt-6 pb-4">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Row 1: [Value] [Type] */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              style={{
                fontSize: "16px",
                fontWeight: 700,
                lineHeight: "24px",
                padding: "6px 12px",
                borderRadius: "999px",
                backgroundColor: valueInfo.bg,
                color: valueInfo.text,
              }}
            >
              {valueInfo.label}
            </span>
            {buyerLabel && (
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: "999px",
                  backgroundColor: "#EAF7F4",
                  color: "#166C57",
                }}
              >
                {buyerLabel}
              </span>
            )}
          </div>

          {/* Row 2: Company name + URL (same line) */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <h3
              style={{
                fontSize: "28px",
                fontWeight: 700,
                lineHeight: "36px",
                color: "#1C1C1A",
              }}
            >
              {lead.company.companyName}
            </h3>
            {lead.company.website && (
              <a
                href={`https://${lead.company.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 shrink-0 hover:underline transition-colors"
                style={{ fontSize: "22px", fontWeight: 600, color: "#1A7F64" }}
              >
                <Globe className="h-4.5 w-4.5 shrink-0" />
                {lead.company.website}
              </a>
            )}
          </div>

          {/* Row 3: Region | Category */}
          <div className="flex items-center gap-2">
            {lead.company.countryRegion && (
              <span style={{ fontSize: "15px", fontWeight: 500, color: "#5B635E" }}>
                {lead.company.countryRegion}
              </span>
            )}
            {lead.company.countryRegion && taskCategory && (
              <span style={{ fontSize: "15px", color: "#5B635E" }}>|</span>
            )}
            {taskCategory && (
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: "999px",
                  backgroundColor: "#F3F1EB",
                  color: "#665F54",
                }}
              >
                {taskCategory}
              </span>
            )}
          </div>

          {lead.previouslyDiscovered && (
            <button
              onClick={() => setShowPrevious(!showPrevious)}
              className="flex items-center gap-1 text-amber-500 hover:text-amber-600 mt-1"
              style={{ fontSize: "12px" }}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              此前已发现过
              {showPrevious ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Right: Judgment block */}
        <div className="shrink-0 flex flex-col items-end gap-2 pt-1">
          <span style={{ fontSize: "17px", fontWeight: 700, color: actionStyle.color }}>
            {actionStyle.label}
          </span>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: "999px",
              backgroundColor: statusBadge.bg,
              color: statusBadge.text,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {showPrevious && lead.previousDiscoveries.length > 0 && (
        <div
          className="mx-7 mb-3 space-y-0.5"
          style={{
            fontSize: "12px",
            color: "#92730A",
            backgroundColor: "rgba(255,243,205,0.5)",
            borderRadius: "12px",
            padding: "10px 14px",
          }}
        >
          {lead.previousDiscoveries.map((pd, i) => (
            <p key={i}>
              {new Date(pd.createdAt).toLocaleDateString("zh-CN")} — {STATUS_LABELS[pd.leadStatus] || pd.leadStatus}
            </p>
          ))}
        </div>
      )}

      {/* ═══ LAYER 2: Secondary Field Blocks ═══ */}
      <div className="px-7 pb-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FieldBlock title="联系方式">
            <div className="space-y-1.5">
              {lead.company.contactEmail ? (
                <a
                  href={`mailto:${lead.company.contactEmail}`}
                  className="flex items-center gap-1.5 transition-colors"
                  style={{ fontSize: "18px", fontWeight: 600, color: "#222521" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#222521")}
                >
                  <Mail className="h-4 w-4 shrink-0 opacity-50" />
                  {lead.company.contactEmail}
                </a>
              ) : (
                <span className="flex items-center gap-1.5" style={{ fontSize: "16px", color: "#9A958E" }}>
                  <Mail className="h-4 w-4 shrink-0 opacity-30" />
                  暂无邮箱
                </span>
              )}
              {lead.company.contactPhone ? (
                <a
                  href={`tel:${lead.company.contactPhone}`}
                  className="flex items-center gap-1.5 transition-colors"
                  style={{ fontSize: "16px", fontWeight: 500, color: "#222521" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#222521")}
                >
                  <Phone className="h-4 w-4 shrink-0 opacity-50" />
                  {lead.company.contactPhone}
                </a>
              ) : (
                <span className="flex items-center gap-1.5" style={{ fontSize: "16px", color: "#9A958E" }}>
                  <Phone className="h-4 w-4 shrink-0 opacity-30" />
                  暂无电话
                </span>
              )}
              {lead.company.website ? (
                <a
                  href={`https://${lead.company.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-colors"
                  style={{ fontSize: "16px", fontWeight: 500, color: "#222521" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#222521")}
                >
                  <Globe className="h-4 w-4 shrink-0 opacity-50" />
                  官网
                </a>
              ) : (
                <span className="flex items-center gap-1.5" style={{ fontSize: "16px", color: "#9A958E" }}>
                  <Globe className="h-4 w-4 shrink-0 opacity-30" />
                  暂无官网
                </span>
              )}
              {lead.company.linkedinUrl ? (
                <a
                  href={lead.company.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-colors"
                  style={{ fontSize: "16px", fontWeight: 500, color: "#222521" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#222521")}
                >
                  <Linkedin className="h-4 w-4 shrink-0 opacity-50" />
                  LinkedIn
                </a>
              ) : (
                <span className="flex items-center gap-1.5" style={{ fontSize: "16px", color: "#9A958E" }}>
                  <Linkedin className="h-4 w-4 shrink-0 opacity-30" />
                  暂无
                </span>
              )}
            </div>
          </FieldBlock>

          <FieldBlock title="规模">
            <span style={{ fontSize: "18px", fontWeight: 600, color: "#222521" }}>
              未知
            </span>
          </FieldBlock>

          <FieldBlock title="来源">
            <div>
              <span style={{ fontSize: "18px", fontWeight: 600, color: "#222521" }}>
                {SOURCE_LABELS[lead.sourceType ?? ""] ?? "—"}
              </span>
              {lead.sourcePlatform && (
                <span className="block mt-1" style={{ fontSize: "14px", color: "#9A958E" }}>
                  {lead.sourcePlatform}
                </span>
              )}
              {lead.sourceUrl && (
                <a
                  href={lead.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 mt-1 transition-colors"
                  style={{ fontSize: "13px", color: "#9A958E" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F7A5A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#9A958E")}
                >
                  <ExternalLink className="h-3 w-3" />
                  原始链接
                </a>
              )}
            </div>
          </FieldBlock>

          <FieldBlock title="入选原因">
            <span
              style={{
                fontSize: "18px",
                fontWeight: 600,
                lineHeight: "28px",
                color: "#222521",
              }}
            >
              {lead.recommendationReason || "—"}
            </span>
          </FieldBlock>
        </div>
      </div>

      {/* ═══ LAYER 3: Action Area ═══ */}
      <div
        className="px-7 py-4 flex items-center justify-between"
        style={{ borderTop: "1px solid #E7E3DA" }}
      >
        <div className="flex items-center gap-2.5">
          <span style={{ fontSize: "14px", color: "#6D6A63" }}>当前状态：</span>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: "999px",
              backgroundColor: statusBadge.bg,
              color: statusBadge.text,
            }}
          >
            {statusLabel}
          </span>
          {lead.note && (
            <span
              className="italic truncate max-w-48"
              style={{ fontSize: "13px", color: "#9A958E" }}
            >
              · {lead.note}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => router.push("/customer-pool")}
            className="relative"
            onMouseEnter={() => setShowProfileTip(true)}
            onMouseLeave={() => setShowProfileTip(false)}
            style={{
              fontSize: "14px",
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: "12px",
              border: "1px solid #0F7A5A",
              color: "#0F7A5A",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            深度画像构建
            {showProfileTip && (
              <span
                className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 whitespace-nowrap pointer-events-none z-50"
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#0F7A5A",
                  backgroundColor: "#E4F6EE",
                  border: "1px solid #B5E6D4",
                  borderRadius: "12px",
                  padding: "8px 14px",
                  boxShadow: "0 4px 16px rgba(15,122,90,0.12)",
                }}
              >
                前往客户池查看画像
                <span
                  className="absolute left-1/2 -bottom-1.5 -translate-x-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: "6px solid #B5E6D4",
                  }}
                />
              </span>
            )}
          </button>
          <ComingSoonBtn
            label="全网动向深度追踪"
            show={showTrackTip}
            onEnter={() => setShowTrackTip(true)}
            onLeave={() => setShowTrackTip(false)}
          />
          <Button
            variant="outline"
            onClick={() => { setFeedbackOpen(!feedbackOpen); setFeedbackAction(null); }}
            style={{
              fontSize: "16px",
              fontWeight: 600,
              borderRadius: "14px",
              height: "46px",
              padding: "0 18px",
              borderColor: "#E7E3DA",
              color: "#4F5752",
            }}
            className="hover:border-[#0F7A5A]/30 hover:text-[#0F7A5A] transition-colors"
          >
            反馈 / 处理
            {feedbackOpen
              ? <ChevronUp className="ml-1.5 h-4 w-4" />
              : <ChevronDown className="ml-1.5 h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ═══ FEEDBACK PANEL ═══ */}
      {feedbackOpen && (
        <div
          className="px-7 py-4 space-y-3"
          style={{ borderTop: "1px solid #E7E3DA", backgroundColor: "#FAFAF8" }}
        >
          {!feedbackAction && (
            <div className="flex items-center gap-2">
              {lead.status === "new" && (
                <>
                  <ActionBtn label="感兴趣" onClick={() => setFeedbackAction("interested")} disabled={submitting} primary />
                  <ActionBtn label="不合适" onClick={() => setFeedbackAction("not_fit")} disabled={submitting} />
                  <ActionBtn label="已联系" onClick={() => handleFeedback("contacted")} disabled={submitting} />
                </>
              )}
              {lead.status === "interested" && (
                <>
                  <ActionBtn label="已联系" onClick={() => handleFeedback("contacted")} disabled={submitting} primary />
                  <ActionBtn label="不合适" onClick={() => setFeedbackAction("not_fit")} disabled={submitting} />
                </>
              )}
              {lead.status === "contacted" && (
                <>
                  <ActionBtn label="跟进中" onClick={() => handleStatusPush("following")} disabled={submitting} primary />
                  <ActionBtn label="暂不跟进" onClick={() => handleStatusPush("paused")} disabled={submitting} />
                  <ActionBtn label="无意向" onClick={() => handleStatusPush("no_interest")} disabled={submitting} muted />
                </>
              )}
              {lead.status === "following" && (
                <>
                  <ActionBtn label="暂停跟进" onClick={() => handleStatusPush("paused")} disabled={submitting} />
                  <ActionBtn label="无意向" onClick={() => handleStatusPush("no_interest")} disabled={submitting} muted />
                </>
              )}
              {lead.status === "paused" && (
                <>
                  <ActionBtn label="继续跟进" onClick={() => handleStatusPush("following")} disabled={submitting} primary />
                  <ActionBtn label="无意向" onClick={() => handleStatusPush("no_interest")} disabled={submitting} muted />
                </>
              )}
              {(lead.status === "dismissed" || lead.status === "no_interest") && (
                <>
                  <ActionBtn label="改为感兴趣" onClick={() => handleFeedback("interested")} disabled={submitting} />
                  <ActionBtn label="改为已联系" onClick={() => handleFeedback("contacted")} disabled={submitting} />
                </>
              )}
            </div>
          )}

          {feedbackAction === "interested" && (
            <div className="space-y-2">
              <p style={{ fontSize: "13px", color: "#6D6A63" }}>补充（可选）：</p>
              <div className="flex flex-wrap gap-2">
                {INTEREST_FOLLOWUP.map((f) => (
                  <Button
                    key={f.value}
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => handleFeedback("interested", f.value)}
                    style={{ height: "36px", fontSize: "13px", borderRadius: "10px", borderColor: "#E7E3DA" }}
                  >
                    {f.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => handleFeedback("interested")}
                  style={{ height: "36px", fontSize: "13px", color: "#9A958E" }}
                >
                  跳过
                </Button>
              </div>
            </div>
          )}

          {feedbackAction === "not_fit" && (
            <div className="space-y-2">
              <p style={{ fontSize: "13px", color: "#6D6A63" }}>不合适原因（可选）：</p>
              <div className="flex flex-wrap gap-2">
                {DISMISS_REASONS.map((r) => (
                  <Button
                    key={r.value}
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => handleFeedback("not_fit", r.value)}
                    style={{ height: "36px", fontSize: "13px", borderRadius: "10px", borderColor: "#E7E3DA" }}
                  >
                    {r.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => handleFeedback("not_fit")}
                  style={{ height: "36px", fontSize: "13px", color: "#9A958E" }}
                >
                  跳过原因
                </Button>
              </div>
            </div>
          )}

          {feedbackAction && (
            <Textarea
              placeholder="备注（可选）"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              rows={1}
              style={{
                fontSize: "14px",
                minHeight: "38px",
                borderColor: "#E7E3DA",
                borderRadius: "10px",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FieldBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: "#F7F5F0",
        border: "1px solid #ECE6DD",
        borderRadius: "16px",
        padding: "16px 18px",
        minHeight: "96px",
      }}
    >
      <p style={{ fontSize: "14px", fontWeight: 600, color: "#6D6A63", marginBottom: "8px" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function ActionBtn({
  label, onClick, disabled, primary = false, muted = false,
}: {
  label: string; onClick: () => void; disabled: boolean; primary?: boolean; muted?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={primary ? "default" : muted ? "ghost" : "outline"}
      disabled={disabled}
      onClick={onClick}
      style={{
        height: "42px",
        fontSize: "15px",
        fontWeight: 600,
        borderRadius: "12px",
        padding: "0 16px",
        ...(primary ? { backgroundColor: "#0F7A5A", color: "white" } : {}),
        ...(muted ? { color: "#9A958E" } : {}),
        ...(!primary && !muted ? { borderColor: "#E7E3DA", color: "#4F5752" } : {}),
      }}
    >
      {label}
    </Button>
  );
}

function ComingSoonBtn({
  label, show, onEnter, onLeave,
}: {
  label: string; show: boolean; onEnter: () => void; onLeave: () => void;
}) {
  return (
    <span
      className="relative cursor-default"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span
        style={{
          fontSize: "14px",
          fontWeight: 600,
          padding: "8px 14px",
          borderRadius: "12px",
          border: "1px dashed #D5CFC6",
          color: "#9A958E",
          display: "inline-block",
        }}
      >
        {label}
      </span>
      {show && (
        <span
          className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 whitespace-nowrap pointer-events-none z-50"
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#0F7A5A",
            backgroundColor: "#E4F6EE",
            border: "1px solid #B5E6D4",
            borderRadius: "12px",
            padding: "8px 14px",
            boxShadow: "0 4px 16px rgba(15,122,90,0.12)",
          }}
        >
          当前未全量开放，可联系后台
          <span
            className="absolute left-1/2 -bottom-1.5 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid #B5E6D4",
            }}
          />
        </span>
      )}
    </span>
  );
}

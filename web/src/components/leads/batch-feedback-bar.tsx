"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";

export function BatchFeedbackBar({ requestId }: { requestId: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [helpfulness, setHelpfulness] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!helpfulness) return;
    setSubmitting(true);
    try {
      const body: Record<string, string> = { helpfulness };
      if (note.trim()) body.note = note.trim();
      await apiFetch(`/api/discovery-requests/${requestId}/feedback`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSubmitted(true);
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        感谢反馈！你的意见将帮助我们持续改进结果质量。
      </div>
    );
  }

  const options = [
    { value: "helpful", label: "有帮助", active: "bg-primary/10 border-primary text-primary" },
    { value: "neutral", label: "一般", active: "bg-secondary border-secondary-foreground/20 text-secondary-foreground" },
    { value: "not_helpful", label: "没帮助", active: "bg-destructive/10 border-destructive text-destructive" },
  ];

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="text-sm font-medium">这批结果整体是否有帮助？</p>
      <div className="flex items-center gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setHelpfulness(opt.value)}
            className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
              helpfulness === opt.value ? opt.active : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {helpfulness && (
        <div className="space-y-2">
          <Textarea
            placeholder="补充说明（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <Button size="sm" disabled={submitting} onClick={handleSubmit} className="text-xs">
            {submitting ? "提交中…" : "提交反馈"}
          </Button>
        </div>
      )}
    </div>
  );
}

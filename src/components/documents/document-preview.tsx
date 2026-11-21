"use client";

import { useEffect, useState } from "react";
import { callApi } from "@/lib/client/call-api";
import { Button } from "@/components/ui/button";
import { strings } from "@/strings/en";

export function DocumentPreview({ documentId, mimeType }: { documentId: string; mimeType: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    callApi<{ url: string }>(`/api/documents/${documentId}/url`, "GET").then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setUrl(result.data.url);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  async function retry() {
    setRetrying(true);
    const result = await callApi<{ url: string }>(`/api/documents/${documentId}/url`, "GET");
    setRetrying(false);
    if (result.ok) {
      setUrl(result.data.url);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }

  if (failed && !url && !retrying) {
    return <p className="text-base text-danger">{strings.documents.previewFailed}</p>;
  }
  if (!url) {
    return <div className="h-[70vh] w-full rounded-lg border border-line" />;
  }
  if (mimeType === "application/pdf") {
    return (
      <div className="flex flex-col gap-2">
        <iframe src={url} title={strings.documents.openPdf} className="h-[70vh] w-full rounded-lg border border-line" />
        <Button type="button" onClick={retry}>{strings.documents.openPdf}</Button>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={strings.documents.previewAlt}
      className="max-h-[70vh] w-full rounded-lg border border-line object-contain"
      onError={() => {
        if (!failed && !retrying) {
          retry();
        }
      }}
    />
  );
}

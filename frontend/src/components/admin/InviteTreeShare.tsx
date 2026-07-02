"use client";

import * as React from "react";
import { useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Check, Copy, Download, MessageCircle, QrCode, X } from "lucide-react";
import type { EventAdmin } from "@/lib/types";
import { buildWhatsappMessage, slugify, whatsappShareUrl } from "@/lib/share";
import { Button } from "@/components/ui/button";

/**
 * Per invite-tree sharing tools for admins: copy a WhatsApp-ready message, open
 * WhatsApp share, and view / download a QR code for the token-based link.
 */
export function InviteTreeShare({
  inviteUrl,
  event,
  treeName,
}: {
  inviteUrl: string;
  event: EventAdmin | null;
  treeName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const message = buildWhatsappMessage(event, inviteUrl);

  function copyMessage() {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copyMessage}>
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy message"}
        </Button>
        <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
        </a>
        <Button size="sm" variant="outline" onClick={() => setShowQr(true)}>
          <QrCode className="h-4 w-4" /> QR code
        </Button>
      </div>

      {showQr && (
        <QrDialog
          inviteUrl={inviteUrl}
          treeName={treeName}
          onClose={() => setShowQr(false)}
        />
      )}
    </>
  );
}

function QrDialog({
  inviteUrl,
  treeName,
  onClose,
}: {
  inviteUrl: string;
  treeName: string;
  onClose: () => void;
}) {
  const canvasWrap = useRef<HTMLDivElement>(null);
  const svgWrap = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const fileBase = `rsvp60-qr-${slugify(treeName)}`;

  function downloadPng() {
    const canvas = canvasWrap.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${fileBase}.png`;
    a.click();
  }

  function downloadSvg() {
    const svg = svgWrap.current?.querySelector("svg");
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-serif text-lg font-bold text-royal">Invite QR code</h3>
            <p className="text-xs text-muted-foreground">{treeName}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div
          ref={canvasWrap}
          className="mx-auto flex w-fit justify-center rounded-lg border bg-white p-3"
        >
          <QRCodeCanvas
            value={inviteUrl}
            size={220}
            level="M"
            marginSize={2}
            fgColor="#1E2A6B"
          />
        </div>

        {/* Hidden high-resolution SVG used only for the SVG download. */}
        <div ref={svgWrap} className="hidden">
          <QRCodeSVG value={inviteUrl} size={512} level="M" marginSize={2} fgColor="#1E2A6B" />
        </div>

        <p className="mt-3 break-all text-center text-xs text-muted-foreground">
          {inviteUrl}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={downloadPng}>
            <Download className="h-4 w-4" /> PNG
          </Button>
          <Button size="sm" variant="outline" onClick={downloadSvg}>
            <Download className="h-4 w-4" /> SVG
          </Button>
          <Button size="sm" variant="outline" onClick={copyLink}>
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Link
          </Button>
        </div>
      </div>
    </div>
  );
}

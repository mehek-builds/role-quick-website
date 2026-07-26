"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

type CredentialResponse = { credential?: string };

type GoogleIdentityApi = {
  initialize(config: {
    client_id: string;
    callback(response: CredentialResponse): void;
    ux_mode?: "popup" | "redirect";
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      text: "continue_with";
      shape: "pill";
      logo_alignment: "left";
      width: number;
    },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityApi } };
  }
}

let initializedClientId: string | null = null;
let currentCredentialHandler: ((response: CredentialResponse) => void) | null = null;

type Props = {
  clientId: string;
  busy: boolean;
  onCredential(credential: string): void;
  onLoadError(): void;
};

export function GoogleSignInButton({ clientId, busy, onCredential, onLoadError }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);

  const renderButton = useCallback(() => {
    const api = window.google?.accounts.id;
    const parent = buttonRef.current;
    if (!api || !parent) return;

    if (initializedClientId !== clientId) {
      api.initialize({
        client_id: clientId,
        ux_mode: "popup",
        callback: (response) => currentCredentialHandler?.(response),
      });
      initializedClientId = clientId;
    }

    parent.replaceChildren();
    api.renderButton(parent, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
      width: Math.max(200, Math.min(320, parent.clientWidth)),
    });
  }, [clientId]);

  useEffect(() => {
    const handler = (response: CredentialResponse) => {
      if (response.credential) onCredential(response.credential);
    };
    currentCredentialHandler = handler;
    renderButton();

    const parent = buttonRef.current;
    const observer = parent && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(renderButton)
      : null;
    if (parent && observer) observer.observe(parent);
    return () => {
      observer?.disconnect();
      if (currentCredentialHandler === handler) currentCredentialHandler = null;
    };
  }, [onCredential, renderButton]);

  return (
    <div className={busy ? "pointer-events-none opacity-50" : undefined} aria-busy={busy}>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={renderButton}
        onError={onLoadError}
      />
      <div ref={buttonRef} className="min-h-10 w-full overflow-hidden rounded-full" />
    </div>
  );
}

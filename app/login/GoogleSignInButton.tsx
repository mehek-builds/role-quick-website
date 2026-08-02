"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
import {
  renderGoogleControl,
  type CredentialResponse,
  type GoogleIdentityApi,
} from "./google-button";

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

    initializedClientId = renderGoogleControl(
      api,
      parent,
      clientId,
      initializedClientId,
      (response) => currentCredentialHandler?.(response),
    );
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
        src="https://accounts.google.com/gsi/client?hl=en"
        strategy="afterInteractive"
        onReady={renderButton}
        onError={onLoadError}
      />
      <div ref={buttonRef} className="min-h-10 w-full overflow-hidden rounded-full" />
    </div>
  );
}

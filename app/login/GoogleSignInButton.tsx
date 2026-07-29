"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

type CredentialResponse = { credential?: string };

type GoogleIdentityApi = {
  initialize(config: {
    client_id: string;
    callback(response: CredentialResponse): void;
    ux_mode?: "popup" | "redirect";
    /** Chrome is retiring the third-party-cookie path One Tap used to read Google sessions
     *  through. Without this the prompt is suppressed outright in current Chrome. */
    use_fedcm_for_prompt?: boolean;
    /** Never true. See the note on prompt() below: signing someone in without a click is not
     *  the same product as offering them a choice. */
    auto_select?: boolean;
    itp_support?: boolean;
  }): void;
  /** The account chooser: the card listing the Google accounts already signed in on this
   *  browser, so signing in is picking one rather than typing an address. */
  prompt(): void;
  cancel(): void;
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
        // auto_select stays OFF. With it on, a returning visitor with exactly one Google session
        // is signed in by the page loading, with no action and no way to pick a different
        // account, which is the opposite of what the chooser is for.
        auto_select: false,
        use_fedcm_for_prompt: true,
        itp_support: true,
        callback: (response) => currentCredentialHandler?.(response),
      });
      initializedClientId = clientId;

      /* Show the account chooser, rather than waiting for the button to be clicked.
       *
       * The button alone had one job too many: clicking it opens Google's popup, and what the
       * popup shows depends on whether the browser will hand Google's frame its session cookies.
       * When it will not (Chrome's default now), the popup is a bare email-and-password form,
       * so someone already signed into three Google accounts in that very browser was being
       * asked to type an address out. prompt() asks through FedCM instead, which is the
       * supported way to read those sessions, and the answer is the list of accounts.
       *
       * The callback is the SAME one the button uses: both hand back a credential JWT that
       * POSTs to /auth/google, so this adds a way in, not a second way to be let in. */
      api.prompt();
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
      /* Take the chooser down with the button. This component unmounts when the form switches to
         Forgot password or the email-code flow, and a Google account card left floating over a
         screen that no longer offers Google is a prompt for a question nobody asked. */
      window.google?.accounts.id.cancel();
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

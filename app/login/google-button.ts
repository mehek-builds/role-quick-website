export type CredentialResponse = { credential?: string };

export type GoogleIdentityApi = {
  initialize(config: {
    client_id: string;
    callback(response: CredentialResponse): void;
    ux_mode?: "popup" | "redirect";
  }): void;
  renderButton(
    parent: unknown,
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

type GoogleButtonParent = {
  clientWidth: number;
  replaceChildren(): void;
};

export function renderGoogleControl(
  api: GoogleIdentityApi,
  parent: GoogleButtonParent,
  clientId: string,
  previousClientId: string | null,
  callback: (response: CredentialResponse) => void,
): string {
  if (previousClientId !== clientId) {
    api.initialize({
      client_id: clientId,
      ux_mode: "popup",
      callback,
    });
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
  return clientId;
}

import packageMetadata from "../package.json";

export const PRODUCT_NAME = "Litos";
export const API_VERSION = "1";
export const WEB_VERSION = packageMetadata.version;

export const PRODUCT_FALLBACK = {
  name: PRODUCT_NAME,
  links: {
    website: "https://trylitos.com",
    install:
      "https://chromewebstore.google.com/detail/bdbedbmkjpfioknfpmhookefabipjaad",
    privacy: "https://trylitos.com/privacy",
    // rolequick.com stopped resolving after the rename. This fallback is
    // only used when the backend meta call fails, but it was still a dead
    // address shipped as the support contact. Now matches the live value the
    // backend serves from PRODUCT_SUPPORT_EMAIL, so the fallback and the real
    // thing cannot drift into two different support addresses again.
    supportEmail: "support@trylitos.com",
  },
} as const;

export function litosClientHeaders(): Record<string, string> {
  return {
    "X-Litos-Client": "web",
    "X-Litos-Version": WEB_VERSION,
  };
}

export type ProductMeta = {
  product: typeof PRODUCT_FALLBACK;
  api: {
    version: string;
    compatibility: {
      extension: { minimum: string };
      web: { minimum: string };
    };
  };
};

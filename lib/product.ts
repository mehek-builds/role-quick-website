export const PRODUCT_NAME = "Litos";
export const API_VERSION = "1";
export const WEB_VERSION = "0.1.0";

export const PRODUCT_FALLBACK = {
  name: PRODUCT_NAME,
  links: {
    website: "https://role-quick-website.vercel.app",
    install:
      "https://chromewebstore.google.com/detail/bdbedbmkjpfioknfpmhookefabipjaad",
    privacy: "https://role-quick-website.vercel.app/privacy",
    supportEmail: "hello@rolequick.com",
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

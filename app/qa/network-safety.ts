export const QA_INTERCEPTION_READY_KEY = "litos_qa_interception_ready_v1";
export const QA_INTERCEPTION_READY_VALUE = "route-interception-installed";

export function hasLoopbackQaApiUrl(apiUrl: string): boolean {
  try {
    const url = new URL(apiUrl);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export function hasQaInterceptionSignal(storage: {
  getItem(key: string): string | null;
}): boolean {
  try {
    return storage.getItem(QA_INTERCEPTION_READY_KEY) === QA_INTERCEPTION_READY_VALUE;
  } catch {
    return false;
  }
}

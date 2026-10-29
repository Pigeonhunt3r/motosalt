export class ServiceError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
export async function jsonRequest<T>(
  url: string,
  options: RequestInit = {},
  timeout = 20000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (options.signal?.aborted)
      throw new ServiceError("Forespørgslen blev afbrudt.");
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: "application/json", ...options.headers },
    });
    if (!response.ok)
      throw new ServiceError(
        response.status === 429
          ? "Tjenesten har travlt. Vent lidt og prøv igen."
          : `Tjenesten svarede med HTTP ${response.status}.`,
        response.status,
      );
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (controller.signal.aborted)
      throw new ServiceError(
        "Forespørgslen tog for lang tid eller blev afbrudt.",
      );
    throw new ServiceError(
      "Tjenesten kunne ikke kontaktes. Kontrollér forbindelsen og prøv igen.",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Der opstod en ukendt fejl.";

import type { SearchShard } from './shard-do';
import type { HashDirectory } from './hashdir-do';

/** Bindings and settings of the Vault Worker (see wrangler.jsonc; secrets are set on the Worker). */
export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  INTAKE: Queue<IntakeMessage>;
  SHARD: DurableObjectNamespace<SearchShard>;
  HASHDIR: DurableObjectNamespace<HashDirectory>;
  ASSETS: Fetcher;

  APP_NAME: string;
  APP_BASE_URL: string;
  RICORSA_URL: string;
  MAIL_FROM: string;
  SHARD_MAX_DOCS?: string;
  SHARD_MAX_BYTES?: string;

  /** Staff key for the admin screens (typed by staff into the admin sign-in). */
  ADMIN_KEY?: string;
  /** Shared with the Ricorsa Worker; authenticates the connection flow and other server-to-server calls. */
  RICORSA_CLIENT_SECRET?: string;
  /** Signs viewer links and admin sessions. */
  LINK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_BASE_URL?: string;
  /** none | azure | moonshot */
  OCR_PROVIDER?: string;
  AZURE_DI_ENDPOINT?: string;
  AZURE_DI_KEY?: string;
  MOONSHOT_API_KEY?: string;
  MOONSHOT_BASE_URL?: string;
};

/** One file to process: read, OCR when needed, classify, index. `ocr` carries the provider's operation between polls. */
export type IntakeMessage = {
  docId: string;
  workspaceId: string;
  tenantId: string;
  batchId: string | null;
  sha256: string;
  name: string;
  size: number;
  ocr?: { provider: string; operation: string; since: number } | null;
};

// Single source of truth for session encryption. The worker cannot import from
// apps/web, so the implementation lives in @ikimetr/connectors and this module
// re-exports it. Re-implementing it here would risk the two copies drifting
// apart and the worker failing to decrypt what the web process wrote.
export { decryptSecret, encryptSecret } from '@ikimetr/connectors/secret-storage';

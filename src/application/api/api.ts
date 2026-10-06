/**
 * Application API compatibility facade.
 *
 * Feature code should import from its module API:
 *   modules/<feature>/api/*
 *
 * This barrel remains temporarily available for legacy imports so the
 * refactor does not change runtime behavior or public import contracts.
 */
export * from './legacyApi';

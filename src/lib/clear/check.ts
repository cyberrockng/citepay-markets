import { v4 as uuidv4 } from "uuid";
import type { Source } from "@/types";
import type { ClaimClearance, ClearMandateConfig, ClearanceVisibility } from "./types";
import type { ClearApiAuth } from "./auth";
import { evaluateClaimClearance } from "./evaluate";
import { hashClearObject } from "./hash";
import { sourceText } from "./source-text";
import { contentHashFromText, sha256 } from "@/lib/evidence";
import {
  getAllSources,
  getClearMandateConfigById,
  getSpentMicroByMandateConfigId,
  insertClaimClearance,
} from "@/lib/db";
import {
  getNeonClearMandateConfigById,
  getNeonSpentMicroByMandateConfigId,
} from "@/lib/neon";

const CLAIM_MAX = 1_000;
const QUOTE_MAX = 2_000;
const INLINE_SOURCE_MAX = 20_000;
const LABEL_MAX = 200;
const EXTERNAL_REF_MAX = 128;
const LICENSE_CLASS_MAX = 64;
const MAX_MICRO = 1_000_000_000;

type JsonObject = Record<string, unknown>;

export type ClearCheckResult =
  | { status: 200; body: ClearCheckSuccess }
  | { status: 400 | 403 | 404 | 413; body: { error: string; field?: string } };

export interface ClearCheckSuccess {
  clearanceId: string;
  decision: ClaimClearance["decision"];
  checks: {
    quoteVerified: boolean;
    supportScore: number;
    supportScoreMethod: "deterministic_overlap_v1";
    licenseClass: string | null;
    priceMicro: number;
    budgetRemainingMicro: number | null;
  };
  settlement: null;
  receiptUrl: string;
  contentHash: string;
  visibility: ClearanceVisibility;
  createdAt: string;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(obj: JsonObject, field: string, max: number): { ok: true; value: string } | { ok: false; status: 400 | 413; error: string; field: string } {
  const value = obj[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, status: 400, error: `${field} is required.`, field };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, status: 413, error: `${field} exceeds ${max} character limit.`, field };
  }
  return { ok: true, value: trimmed };
}

function optionalStringField(obj: JsonObject, field: string, max: number): { ok: true; value: string | null } | { ok: false; status: 400 | 413; error: string; field: string } {
  const value = obj[field];
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, status: 400, error: `${field} must be a string.`, field };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, status: 413, error: `${field} exceeds ${max} character limit.`, field };
  }
  return { ok: true, value: trimmed };
}

function integerField(value: unknown, field: string, fallback: number): { ok: true; value: number } | { ok: false; status: 400; error: string; field: string } {
  if (value === undefined || value === null) return { ok: true, value: fallback };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_MICRO) {
    return { ok: false, status: 400, error: `${field} must be a non-negative integer micro-USDC amount.`, field };
  }
  return { ok: true, value };
}

function makeInlineSource(opts: {
  text: string;
  label: string;
  licenseClass: string;
  priceMicro: number;
}): Source {
  const hash = contentHashFromText(opts.text);
  return {
    id: `inline-${hash.slice(0, 16)}`,
    title: opts.label,
    url: `inline://citepay/${hash.slice(0, 16)}`,
    creatorName: "Inline Source",
    creatorHandle: "inline",
    payoutWallet: "inline",
    contentHash: hash,
    metadataURI: "",
    description: opts.text,
    price: opts.priceMicro,
    bond: 0,
    bonded: false,
    reputation: 0,
    paidCount: 0,
    refusedCount: 0,
    skipCount: 0,
    active: true,
    createdAt: new Date().toISOString(),
    onChainId: null,
    category: "Inline",
    fullContent: opts.text,
    assetType: "article",
    licenseClass: opts.licenseClass,
    verificationStatus: "unverified",
    riskScore: 0,
  };
}

function normalizeTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFKC")
    .match(/[a-z0-9]{3,}/g) ?? [];
  return new Set(words);
}

export function scoreClaimSupport(claim: string, quote: string): number {
  const claimTokens = normalizeTokens(claim);
  if (claimTokens.size === 0) return 0;
  const quoteTokens = normalizeTokens(quote);
  let overlap = 0;
  for (const token of claimTokens) {
    if (quoteTokens.has(token)) overlap += 1;
  }
  return Math.max(0, Math.min(100, Math.round((overlap / claimTokens.size) * 100)));
}

async function resolveMandate(policy: JsonObject, auth: ClearApiAuth): Promise<
  | { ok: true; mandate: ClearMandateConfig; spentMicro: number; inline: boolean }
  | { ok: false; status: 400 | 403 | 404; error: string; field?: string }
> {
  const hasMandate = typeof policy.mandateConfigId === "string" && policy.mandateConfigId.trim().length > 0;
  const hasInline = policy.maxPricePerCitationMicro !== undefined || policy.requiredLicenseClass !== undefined;
  if (hasMandate === hasInline) {
    return { ok: false, status: 400, error: "Provide exactly one policy mode: mandateConfigId or inline policy.", field: "policy" };
  }

  if (hasMandate) {
    const mandateConfigId = (policy.mandateConfigId as string).trim();
    const mandate = getClearMandateConfigById(mandateConfigId) ?? await getNeonClearMandateConfigById(mandateConfigId);
    if (!mandate) return { ok: false, status: 404, error: "Unknown mandateConfigId.", field: "policy.mandateConfigId" };
    if (mandate.ownerKeyHash && mandate.ownerKeyHash !== auth.keyHash) {
      return { ok: false, status: 403, error: "This API key does not own the requested mandate.", field: "policy.mandateConfigId" };
    }
    const spentMicro = Math.max(
      getSpentMicroByMandateConfigId(mandateConfigId),
      await getNeonSpentMicroByMandateConfigId(mandateConfigId)
    );
    return { ok: true, mandate, spentMicro, inline: false };
  }

  const maxPrice = integerField(policy.maxPricePerCitationMicro, "policy.maxPricePerCitationMicro", 0);
  if (!maxPrice.ok) return maxPrice;
  const minSupport = integerField(policy.minSupportScore, "policy.minSupportScore", 0);
  if (!minSupport.ok) return minSupport;
  const requiredLicenseClass = typeof policy.requiredLicenseClass === "string" && policy.requiredLicenseClass.trim()
    ? policy.requiredLicenseClass.trim()
    : null;
  const now = new Date().toISOString();
  const base = {
    mandateConfigId: `inline-${uuidv4()}`,
    ownerKeyHash: auth.keyHash,
    onChainMandateId: null,
    operatorWallet: auth.ownerLabel,
    agentWallet: auth.ownerLabel,
    policyName: "inline-check-policy",
    budgetCapMicro: maxPrice.value,
    maxPricePerCitationMicro: maxPrice.value,
    maxPricePerClaimMicro: maxPrice.value,
    allowedSourceTypes: null,
    blockedDomains: null,
    blockedWallets: null,
    requiredLicenseClass,
    requirePublisherVerified: false,
    requireQuoteSpan: true,
    minSupportScore: minSupport.value,
    challengeWindowSeconds: 86_400,
    expiresAt: null,
    operatorSignature: null,
    createdAt: now,
  };
  return {
    ok: true,
    mandate: { ...base, mandateHash: hashClearObject(base) },
    spentMicro: 0,
    inline: true,
  };
}

async function resolveSource(input: JsonObject, inlineMandate: ClearMandateConfig | null): Promise<
  | { ok: true; source: Source; sourceFullText: string }
  | { ok: false; status: 400 | 404 | 413; error: string; field?: string }
> {
  if ("sourceUrl" in input) {
    return { ok: false, status: 400, error: "sourceUrl is not supported in Stage 2. Use source.onChainId or source.text.", field: "sourceUrl" };
  }

  const sourceInput = input.source;
  if (!isObject(sourceInput)) {
    return { ok: false, status: 400, error: "source is required.", field: "source" };
  }
  if ("sourceUrl" in sourceInput || "url" in sourceInput) {
    return { ok: false, status: 400, error: "sourceUrl is not supported in Stage 2. Use source.onChainId or source.text.", field: "source" };
  }

  const hasOnChainId = sourceInput.onChainId !== undefined && sourceInput.onChainId !== null && sourceInput.onChainId !== "";
  const hasText = sourceInput.text !== undefined && sourceInput.text !== null && sourceInput.text !== "";
  if (hasOnChainId === hasText) {
    return { ok: false, status: 400, error: "Provide exactly one source mode: onChainId or inline text.", field: "source" };
  }

  if (hasOnChainId) {
    const raw = String(sourceInput.onChainId).trim();
    if (!/^\d+$/.test(raw)) {
      return { ok: false, status: 400, error: "source.onChainId must be a numeric string.", field: "source.onChainId" };
    }
    const onChainId = Number(raw);
    const source = getAllSources().find((s) => s.onChainId === onChainId);
    if (!source) return { ok: false, status: 404, error: "Unknown source.onChainId.", field: "source.onChainId" };
    return { ok: true, source, sourceFullText: sourceText(source) };
  }

  const text = stringField(sourceInput, "text", INLINE_SOURCE_MAX);
  if (!text.ok) return text;
  const label = optionalStringField(sourceInput, "label", LABEL_MAX);
  if (!label.ok) return label;
  const price = integerField(sourceInput.priceMicro, "source.priceMicro", 0);
  if (!price.ok) return price;
  const licenseClassField = optionalStringField(sourceInput, "licenseClass", LICENSE_CLASS_MAX);
  if (!licenseClassField.ok) return licenseClassField;
  const licenseClass = licenseClassField.value ?? inlineMandate?.requiredLicenseClass ?? "unlicensed";
  const source = makeInlineSource({
    text: text.value,
    label: label.value ?? "Inline source",
    licenseClass,
    priceMicro: price.value,
  });
  return { ok: true, source, sourceFullText: text.value };
}

export async function runClearCheck(input: unknown, auth: ClearApiAuth, baseUrl: string): Promise<ClearCheckResult> {
  if (!isObject(input)) {
    return { status: 400, body: { error: "JSON body must be an object." } };
  }

  const claim = stringField(input, "claim", CLAIM_MAX);
  if (!claim.ok) return { status: claim.status, body: { error: claim.error, field: claim.field } };
  const quote = stringField(input, "quote", QUOTE_MAX);
  if (!quote.ok) return { status: quote.status, body: { error: quote.error, field: quote.field } };
  const externalRef = optionalStringField(input, "externalRef", EXTERNAL_REF_MAX);
  if (!externalRef.ok) return { status: externalRef.status, body: { error: externalRef.error, field: externalRef.field } };

  const visibilityRaw = input.visibility ?? "private_hash_only";
  if (visibilityRaw !== "public" && visibilityRaw !== "private_hash_only") {
    return { status: 400, body: { error: "visibility must be public or private_hash_only.", field: "visibility" } };
  }
  const visibility = visibilityRaw as ClearanceVisibility;

  const policyInput = input.policy;
  if (!isObject(policyInput)) {
    return { status: 400, body: { error: "policy is required.", field: "policy" } };
  }
  const mandateResult = await resolveMandate(policyInput, auth);
  if (!mandateResult.ok) {
    return { status: mandateResult.status, body: { error: mandateResult.error, field: mandateResult.field } };
  }

  const sourceResult = await resolveSource(input, mandateResult.inline ? mandateResult.mandate : null);
  if (!sourceResult.ok) {
    return { status: sourceResult.status, body: { error: sourceResult.error, field: sourceResult.field } };
  }

  const answerHash = sha256(`${claim.value}\n${quote.value}\n${sourceResult.source.contentHash}`);
  const supportScore = scoreClaimSupport(claim.value, quote.value);
  const clearance = evaluateClaimClearance({
    clearanceId: `clr_${uuidv4()}`,
    mandate: mandateResult.mandate,
    source: sourceResult.source,
    answerHash,
    claimText: claim.value,
    quoteText: quote.value,
    sourceFullText: sourceResult.sourceFullText,
    supportScore,
    sessionSpentMicro: mandateResult.spentMicro,
  });
  const ownedClearance: ClaimClearance = {
    ...clearance,
    ownerKeyHash: auth.keyHash,
    visibility,
  };
  insertClaimClearance(ownedClearance);

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return {
    status: 200,
    body: {
      clearanceId: ownedClearance.clearanceId,
      decision: ownedClearance.decision,
      checks: {
        quoteVerified: ownedClearance.quoteVerified,
        supportScore: ownedClearance.supportScore,
        supportScoreMethod: "deterministic_overlap_v1",
        licenseClass: ownedClearance.licenseClass,
        priceMicro: sourceResult.source.price,
        budgetRemainingMicro: mandateResult.mandate.budgetCapMicro - mandateResult.spentMicro,
      },
      settlement: null,
      receiptUrl: `${normalizedBaseUrl}/clearance/${ownedClearance.clearanceId}`,
      contentHash: `sha256:${ownedClearance.receiptHash}`,
      visibility,
      createdAt: ownedClearance.createdAt,
    },
  };
}

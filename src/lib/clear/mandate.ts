import { v4 as uuidv4 } from "uuid";
import type { ClearMandateConfig } from "./types";
import type { ClearApiAuth } from "./auth";
import { hashClearObject } from "./hash";
import { insertClearMandateConfig } from "@/lib/db";
import { upsertNeonClearMandateConfig } from "@/lib/neon";

const NAME_MAX = 100;
const MAX_MICRO = 1_000_000_000;
const LICENSE_CLASSES = new Set(["standard", "open", "clear-demo"]);

type JsonObject = Record<string, unknown>;

export type ClearMandateResult =
  | { status: 201; body: ClearMandateSuccess }
  | { status: 400; body: { error: string; field?: string } };

export interface ClearMandateSuccess {
  mandateConfigId: string;
  name: string;
  requiredLicenseClass: string;
  maxPricePerCitationMicro: number;
  totalBudgetMicro: number;
  spentMicro: 0;
  onChainMandateId: null;
  anchoring: "not_anchored";
  createdAt: string;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(obj: JsonObject, field: string, max: number): { ok: true; value: string } | { ok: false; error: string; field: string } {
  const value = obj[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: `${field} is required.`, field };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, error: `${field} exceeds ${max} character limit.`, field };
  }
  return { ok: true, value: trimmed };
}

function microField(obj: JsonObject, field: string): { ok: true; value: number } | { ok: false; error: string; field: string } {
  const value = obj[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_MICRO) {
    return { ok: false, error: `${field} must be a positive integer micro-USDC amount.`, field };
  }
  return { ok: true, value };
}

export async function createClearMandate(input: unknown, auth: ClearApiAuth): Promise<ClearMandateResult> {
  if (!isObject(input)) {
    return { status: 400, body: { error: "JSON body must be an object." } };
  }

  const name = stringField(input, "name", NAME_MAX);
  if (!name.ok) return { status: 400, body: { error: name.error, field: name.field } };

  const license = stringField(input, "requiredLicenseClass", 40);
  if (!license.ok) return { status: 400, body: { error: license.error, field: license.field } };
  if (!LICENSE_CLASSES.has(license.value)) {
    return {
      status: 400,
      body: { error: "requiredLicenseClass must be one of: standard, open, clear-demo.", field: "requiredLicenseClass" },
    };
  }

  const maxPrice = microField(input, "maxPricePerCitationMicro");
  if (!maxPrice.ok) return { status: 400, body: { error: maxPrice.error, field: maxPrice.field } };

  const totalBudget = microField(input, "totalBudgetMicro");
  if (!totalBudget.ok) return { status: 400, body: { error: totalBudget.error, field: totalBudget.field } };

  if (maxPrice.value > totalBudget.value) {
    return {
      status: 400,
      body: { error: "maxPricePerCitationMicro cannot exceed totalBudgetMicro.", field: "maxPricePerCitationMicro" },
    };
  }

  const now = new Date().toISOString();
  const base = {
    mandateConfigId: `mnd_${uuidv4()}`,
    ownerKeyHash: auth.keyHash,
    onChainMandateId: null,
    operatorWallet: auth.ownerLabel,
    agentWallet: auth.ownerLabel,
    policyName: name.value,
    budgetCapMicro: totalBudget.value,
    maxPricePerCitationMicro: maxPrice.value,
    maxPricePerClaimMicro: maxPrice.value,
    allowedSourceTypes: ["article"],
    blockedDomains: null,
    blockedWallets: null,
    requiredLicenseClass: license.value,
    requirePublisherVerified: false,
    requireQuoteSpan: true,
    minSupportScore: 0,
    challengeWindowSeconds: 86_400,
    expiresAt: null,
    operatorSignature: null,
    createdAt: now,
  };
  const mandate: ClearMandateConfig = { ...base, mandateHash: hashClearObject(base) };

  insertClearMandateConfig(mandate);
  await upsertNeonClearMandateConfig(mandate);

  return {
    status: 201,
    body: {
      mandateConfigId: mandate.mandateConfigId,
      name: mandate.policyName,
      requiredLicenseClass: mandate.requiredLicenseClass ?? license.value,
      maxPricePerCitationMicro: mandate.maxPricePerCitationMicro,
      totalBudgetMicro: mandate.budgetCapMicro,
      spentMicro: 0,
      onChainMandateId: null,
      anchoring: "not_anchored",
      createdAt: mandate.createdAt,
    },
  };
}

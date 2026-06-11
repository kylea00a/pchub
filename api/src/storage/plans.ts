export type StoragePlan = {
  id: string;
  name: string;
  quotaGb: number;
  quotaBytes: number;
  priceMonthlyCents: number;
  priceFormatted: string;
  description: string;
};

export const STORAGE_PLANS: StoragePlan[] = [
  {
    id: "none",
    name: "Ephemeral",
    quotaGb: 0,
    quotaBytes: 0,
    priceMonthlyCents: 0,
    priceFormatted: "Free",
    description: "Fresh desktop each session. Nothing saved after you disconnect.",
  },
  {
    id: "personal_5",
    name: "Personal 5 GB",
    quotaGb: 5,
    quotaBytes: 5 * 1024 ** 3,
    priceMonthlyCents: 9900,
    priceFormatted: "₱99/mo",
    description:
      "Projects, documents, and settings synced to cloud — not stored on the host PC.",
  },
  {
    id: "personal_20",
    name: "Personal 20 GB",
    quotaGb: 20,
    quotaBytes: 20 * 1024 ** 3,
    priceMonthlyCents: 24900,
    priceFormatted: "₱249/mo",
    description: "Larger personal layer for bigger projects and asset folders.",
  },
];

export function getPlan(planId: string): StoragePlan | undefined {
  return STORAGE_PLANS.find((p) => p.id === planId);
}

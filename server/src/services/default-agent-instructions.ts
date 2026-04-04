import fs from "node:fs/promises";

const DEFAULT_AGENT_BUNDLE_FILES = {
  default: ["AGENTS.md"],
  ceo: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"],
  executive: ["AGENTS.md"],
  operations: ["AGENTS.md"],
  logistics: ["AGENTS.md"],
  sales: ["AGENTS.md"],
  support: ["AGENTS.md"],
  "supply-chain": ["AGENTS.md"],
  marketing: ["AGENTS.md"],
} as const;

type DefaultAgentBundleRole = keyof typeof DEFAULT_AGENT_BUNDLE_FILES;

function resolveDefaultAgentBundleUrl(role: DefaultAgentBundleRole, fileName: string) {
  return new URL(`../onboarding-assets/${role}/${fileName}`, import.meta.url);
}

export async function loadDefaultAgentInstructionsBundle(role: DefaultAgentBundleRole): Promise<Record<string, string>> {
  const fileNames = DEFAULT_AGENT_BUNDLE_FILES[role];
  const entries = await Promise.all(
    fileNames.map(async (fileName) => {
      const content = await fs.readFile(resolveDefaultAgentBundleUrl(role, fileName), "utf8");
      return [fileName, content] as const;
    }),
  );
  return Object.fromEntries(entries);
}

const ROLE_MAPPING: Record<string, DefaultAgentBundleRole> = {
  ceo: "ceo",
  executive: "executive",
  operations: "operations",
  cto: "operations",
  logistics: "logistics",
  sales: "sales",
  cmo: "sales",
  cfo: "sales",
  support: "support",
  pm: "support",
  "supply-chain": "supply-chain",
  devops: "supply-chain",
  marketing: "marketing",
  researcher: "marketing",
};

export function resolveDefaultAgentInstructionsBundleRole(role: string): DefaultAgentBundleRole {
  return ROLE_MAPPING[role] || "default";
}

// Type augmentation for Express Request — adds actor property set by auth middleware
declare namespace Express {
  interface Request {
    actor: {
      type: "board" | "agent" | "none";
      userId?: string;
      agentId?: string;
      companyId?: string;
      isInstanceAdmin?: boolean;
      source?: string;
      runId?: string;
    };
  }
}

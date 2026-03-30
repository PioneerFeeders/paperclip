import "express";

declare module "express-serve-static-core" {
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

import { EventEmitter } from "events";

export interface AgentDecisionEvent {
  decision: string;
  sourceTitle: string;
  amountPaid: number;
  evidenceHash: string;
  query: string;
  timestamp: string;
  historical?: boolean;
}

export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(50);

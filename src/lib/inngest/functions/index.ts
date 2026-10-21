import { discoverCampaign } from "./discover";
import { auditLead } from "./audit";
import { generateLead } from "./generate";
import { sendLead } from "./send";

export const functions = [discoverCampaign, auditLead, generateLead, sendLead];

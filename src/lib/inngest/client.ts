import { EventSchemas, Inngest } from "inngest";

// Evenimentele pipeline-ului. Fiecare pas emite următorul, deci poți
// reporni oricare pas manual din dashboard (sau din Inngest UI).
type Events = {
  "campaign/discover": { data: { campaignId: string } };
  "lead/audit": { data: { leadId: string } };
  "lead/generate": { data: { leadId: string } };
  "lead/send": { data: { leadId: string } };
};

export const inngest = new Inngest({
  id: "site-refresh",
  schemas: new EventSchemas().fromRecord<Events>(),
});

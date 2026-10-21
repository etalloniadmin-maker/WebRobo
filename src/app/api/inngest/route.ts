import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const maxDuration = 300; // Vercel Pro; pe Hobby max 60s per pas

export const { GET, POST, PUT } = serve({ client: inngest, functions });

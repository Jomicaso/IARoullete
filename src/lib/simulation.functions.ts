import { createServerFn } from "@tanstack/react-start";

export type SimSession = {
  session: string;
  start_bank: number;
  end_bank: number;
  entries: number;
  wins: number;
  losses: number;
  total_staked: number;
  insufficient: boolean;
  closed: boolean;
};

export const getSimulation = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ day: string; sessions: SimSession[] }> => {
    const { lisbonNow } = await import("@/lib/simulation");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { day } = lisbonNow();
    const { data } = await supabaseAdmin
      .from("simulation_sessions")
      .select("session,start_bank,end_bank,entries,wins,losses,total_staked,insufficient,closed")
      .eq("day", day);
    return { day, sessions: (data ?? []) as unknown as SimSession[] };
  },
);

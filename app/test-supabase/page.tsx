import { supabase } from "@/lib/supabase";

export default async function TestSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const demandes = await supabase
    .from("demandes")
    .select("*");

  const propositions = await supabase
    .from("propositions_rdv")
    .select("*");

  const clients = await supabase
    .from("clients")
    .select("*");

  return (
    <pre>
      {JSON.stringify(
        {
          url,
          demandes,
          propositions,
          clients
        },
        null,
        2
      )}
    </pre>
  );
}

import { supabase } from "@/lib/supabase";

export default async function TestSupabase() {
  const { data, error } = await supabase
    .from("rendez_vous")
    .select("*")
    .eq(
      "garage_id",
      "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"
    );

  return (
    <pre>
      {JSON.stringify(
        { data, error },
        null,
        2
      )}
    </pre>
  );
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find pending PIX orders older than 10 minutes (não confirmados = cancelados)
    const thirtyMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: expiredOrders, error: fetchError } = await supabase
      .from("orders")
      .select("id, created_at, user_id, total")
      .eq("status", "pending")
      .eq("payment_method", "pix")
      .lt("created_at", thirtyMinutesAgo);

    if (fetchError) {
      console.error("Error fetching expired orders:", fetchError);
      throw fetchError;
    }

    if (!expiredOrders || expiredOrders.length === 0) {
      console.log("No expired PIX orders found");
      return new Response(
        JSON.stringify({ message: "No expired orders", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${expiredOrders.length} expired PIX orders to cancel`);

    // Cancel each expired order
    const orderIds = expiredOrders.map((o) => o.id);
    
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .in("id", orderIds);

    if (updateError) {
      console.error("Error cancelling expired orders:", updateError);
      throw updateError;
    }

    console.log(`Successfully cancelled ${orderIds.length} expired PIX orders:`, orderIds);

    return new Response(
      JSON.stringify({ 
        message: "Expired orders cancelled", 
        count: orderIds.length,
        orderIds 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in expire-pix-orders function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

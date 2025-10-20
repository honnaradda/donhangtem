// Fix: Provide a minimal Deno namespace declaration to make the code compatible with
// standard TypeScript tooling that is not Deno-aware. This resolves errors about
// 'Deno' not being found without requiring project-level configuration changes.
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
}

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import webpush from "npm:web-push@3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

// --- KHÔNG khởi tạo webpush ở top-level để tránh 500 ---
let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;

  const pub = Deno.env.get("WEB_PUSH_VAPID_PUBLIC");
  const priv = Deno.env.get("WEB_PUSH_VAPID_PRIVATE");
  const contact = Deno.env.get("WEB_PUSH_CONTACT") || "mailto:admin@example.com";

  if (!pub || !priv) {
    throw new Error("Missing VAPID keys: WEB_PUSH_VAPID_PUBLIC/PRIVATE");
  }
  webpush.setVapidDetails(contact, pub, priv);
  vapidReady = true;
}

// Supabase client - Fail-fast initialization
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SERVICE_ROLE_KEY");

if (!SUPABASE_URL) {
  throw new Error("Missing required environment variable: SUPABASE_URL");
}
if (!SERVICE_ROLE) {
  throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(
  SUPABASE_URL,
  SERVICE_ROLE,
  { auth: { persistSession: false } },
);

serve(async (req: Request) => {
  try {
    // 1) CORS preflight - Hoàn toàn độc lập, không phụ thuộc vào secrets
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: CORS,
      });
    }

    // 2) Chỉ đọc body ở POST
    const { order_id, title, body } = await req.json();

    // 3) Bật VAPID khi cần
    ensureVapid();

    // 4) Lấy subscriptions
    const { data: subs, error } = await sb
      .from("push_subscriptions")
      .select("id, subscription_details");

    if (error) throw error;

    // 5) Payload
    const payload = JSON.stringify({
      type: "ORDER_CREATED",
      order_id,
      title: title ?? "Đơn hàng mới",
      body: body ?? "Một đơn hàng vừa được tạo",
      timestamp: Date.now(),
    });

    const toDelete: string[] = [];

    // Sử dụng Promise.allSettled để tăng độ bền, không bị dừng khi một push lỗi
    const results = await Promise.allSettled(
      (subs ?? []).map((row: any) => 
        webpush.sendNotification(row.subscription_details, payload)
      )
    );
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const err = result.reason as any;
        const status = err?.statusCode ?? err?.status;
        if (status === 404 || status === 410) {
          // Endpoint không tồn tại hoặc hết hạn -> thêm vào danh sách xóa
          toDelete.push(subs![index].id);
        } else {
          // Log các lỗi khác để debug
          console.error("Push error", status, err?.body ?? String(err));
        }
      }
    });


    if (toDelete.length) {
      await sb.from("push_subscriptions").delete().in("id", toDelete);
    }

    return new Response(
      JSON.stringify({ ok: true, sent: subs?.length ?? 0, deleted: toDelete.length }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Handler error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});

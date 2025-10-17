// supabase/functions/send-order-notification/index.ts
import { serve } from 'serve';
import { createClient } from 'createClient';
import webpush from 'webpush';

// FIX: Add type definition for Deno global to fix "Cannot find name 'Deno'" error.
// This is necessary when the TypeScript checker is not configured for a Deno environment.
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// Lấy VAPID keys đã được bạn cài đặt bí mật ở bước sau
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;

// Cấu hình web-push với VAPID keys của bạn
webpush.setVapidDetails(
  'mailto:your-email@example.com', // QUAN TRỌNG: Thay thế bằng email của bạn
  vapidPublicKey,
  vapidPrivateKey
);

serve(async (req) => {
  try {
    // Lấy thông tin đơn hàng mới từ trigger của database
    const { record: newOrder } = await req.json();
    
    // Khởi tạo Supabase client với quyền admin để truy cập bảng push_subscriptions
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Lấy tất cả các đăng ký nhận thông báo từ cơ sở dữ liệu
    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription_details');

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      console.log('Không tìm thấy đăng ký nào để gửi thông báo.');
      return new Response('No subscriptions found.', { status: 200 });
    }

    // Chuẩn bị nội dung thông báo sẽ hiển thị trên điện thoại
    const notificationPayload = JSON.stringify({
      title: 'Có đơn hàng mới!',
      body: `Đơn hàng: "${newOrder.name}" cho nhà máy ${newOrder.factory}.`,
    });

    // Gửi thông báo đến tất cả các thiết bị đã đăng ký
    const sendPromises = subscriptions.map(({ subscription_details }) => 
      webpush.sendNotification(subscription_details, notificationPayload)
        .catch(async (err) => {
          // Nếu đăng ký đã hết hạn (lỗi 410), tự động xóa nó khỏi CSDL
          if (err.statusCode === 410) {
            await supabaseAdmin
              .from('push_subscriptions')
              .delete()
              .eq('id', subscription_details.endpoint);
          } else {
            console.error('Lỗi gửi thông báo:', err.body);
          }
        })
    );

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ message: "Notifications sent." }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(String(err?.message ?? err), { status: 500 });
  }
});

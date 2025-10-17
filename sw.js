/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Service Worker for handling push notifications

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  
  // Default values
  let notificationData = {
    title: 'Thông báo mới',
    body: 'Bạn có một cập nhật mới.',
    icon: './icons/icon-192x192.png', // Path to a default icon
    badge: './icons/badge-72x72.png', // Path to a badge icon for Android
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData.title = data.title || notificationData.title;
      notificationData.body = data.body || notificationData.body;
      if (data.icon) notificationData.icon = data.icon;
    } catch (e) {
      console.error('Error parsing push data:', e);
      // Fallback to text if JSON parsing fails
      notificationData.body = event.data.text();
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: [100, 50, 100], // Vibrate pattern
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    },
    actions: [
      { action: 'explore', title: 'Xem chi tiết', icon: '' },
      { action: 'close', title: 'Đóng', icon: '' },
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');

  event.notification.close();

  // This looks for an open window matching the app's URL and focuses it.
  // If no window is open, it opens a new one.
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        // You might want to refine this URL check
        if ('focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});